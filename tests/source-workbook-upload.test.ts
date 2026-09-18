import type { PrismaClient, User } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { maximumSourceWorkbookBytes, sourceWorkbookContentTypes } from "../lib/data-mapper/source-workbook-policy";
import { createInMemorySourceWorkbookStorage } from "../lib/data-mapper/source-workbook-storage";
import {
  authoriseSourceWorkbookUpload,
  hasSourceWorkbookUploadPermission,
  validateSourceWorkbookUploadIntent
} from "../lib/data-mapper/source-workbook-upload";

const actor = { id: "user-a", tenantId: "tenant-a" };
const secret = "test-source-upload-secret-that-is-long-enough";
const now = Date.parse("2026-09-16T12:00:00Z");
const contentType = sourceWorkbookContentTypes.xlsx;

function database(source: { id: string; projectId: string } | null = null, project: { id: string; sourceWorkbookImports: Array<{ id: string }> } | null = { id: "project-a", sourceWorkbookImports: [] }) {
  return {
    project: { findFirst: vi.fn(async () => project) },
    sourceWorkbookImport: { findFirst: vi.fn(async () => source) }
  } as unknown as PrismaClient;
}

async function authorise(overrides: Record<string, unknown> = {}, db = database()) {
  const storage = createInMemorySourceWorkbookStorage();
  const result = await authoriseSourceWorkbookUpload(db, actor, {
    fileName: "pricebook.xlsx",
    fileSizeBytes: 5 * 1024 * 1024,
    contentType,
    projectId: "project-a",
    ...overrides
  }, { storage, secret, now, uploadId: "11111111-1111-4111-8111-111111111111" });
  return { result, storage };
}

describe("source workbook upload authorisation", () => {
  it("requires an authenticated actor with both upload and edit permissions", () => {
    expect(hasSourceWorkbookUploadPermission(null)).toBe(false);
    expect(hasSourceWorkbookUploadPermission({ role: "VIEW_ONLY", permissions: {} } as Pick<User, "role" | "permissions">)).toBe(false);
    expect(hasSourceWorkbookUploadPermission({ role: "SUPER_USER", permissions: {} } as Pick<User, "role" | "permissions">)).toBe(true);
    expect(hasSourceWorkbookUploadPermission({ role: "SUPER_USER", permissions: { editRecords: false } } as Pick<User, "role" | "permissions">)).toBe(false);
  });

  it("issues a short-lived authorisation for one deterministic tenant path", async () => {
    const { result } = await authorise({ storageKey: "client/override.exe" });
    const payload = validateSourceWorkbookUploadIntent({ uploadIntent: result.uploadIntent, actor, secret, now });

    expect(payload.storageKey).toBe("source-workbooks/tenant-a/11111111-1111-4111-8111-111111111111/original.xlsx");
    expect(payload.projectId).toBe("project-a");
    expect(payload.storageKey).not.toContain("client/override.exe");
    expect(result.contentType).toBe(contentType);
    expect(result.expiresAt - now).toBe(10 * 60 * 1000);
  });

  it("accepts a declared file above 4.5 MB and the exact 20 MB limit without receiving its bytes", async () => {
    await expect(authorise({ fileSizeBytes: 4.5 * 1024 * 1024 + 1 })).resolves.toBeDefined();
    await expect(authorise({ fileSizeBytes: maximumSourceWorkbookBytes })).resolves.toBeDefined();
  });

  it("rejects files above 20 MB, empty files, wrong extensions and wrong declared MIME types", async () => {
    await expect(authorise({ fileSizeBytes: maximumSourceWorkbookBytes + 1 })).rejects.toThrow("larger than the 20 MB");
    await expect(authorise({ fileSizeBytes: 0 })).rejects.toThrow("non-empty");
    await expect(authorise({ fileName: "payload.exe" })).rejects.toThrow(".xlsx or .xlsm");
    await expect(authorise({ contentType: "application/x-msdownload" })).rejects.toThrow("content type");
  });

  it("rejects a replacement source outside the authenticated tenant", async () => {
    const db = database(null);
    await expect(authorise({ replaceSourceWorkbookImportId: "tenant-b-source" }, db)).rejects.toThrow("not available for this tenant");
    expect(db.sourceWorkbookImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "tenant-b-source", tenantId: "tenant-a" } }));
  });

  it("requires Project identity for every new upload", async () => {
    await expect(authorise({ projectId: undefined })).rejects.toThrow("Choose a Project");
  });

  it("rejects a new upload for a Project outside the authenticated tenant", async () => {
    const db = database(null, null);
    await expect(authorise({}, db)).rejects.toThrow("Project is not available");
    expect(db.project.findFirst).toHaveBeenCalledWith({ where: { id: "project-a", tenantId: "tenant-a" }, select: { id: true, sourceWorkbookImports: { take: 1, select: { id: true } } } });
  });

  it("requires the replacement flow when a Project already has a current workbook", async () => {
    const db = database(null, { id: "project-a", sourceWorkbookImports: [{ id: "source-existing" }] });
    await expect(authorise({}, db)).rejects.toThrow("Use Replace workbook");
  });

  it("keeps replacement authorisation in the source workbook's server-authoritative Project", async () => {
    const db = database({ id: "source-a", projectId: "project-existing" });
    await expect(authorise({ replaceSourceWorkbookImportId: "source-a" }, db)).rejects.toThrow("must remain in its existing Project");
  });

  it("binds finalisation to the issuing user and tenant and rejects expiry or tampering", async () => {
    const { result } = await authorise();
    expect(() => validateSourceWorkbookUploadIntent({ uploadIntent: result.uploadIntent, actor: { id: "user-b", tenantId: "tenant-a" }, secret, now })).toThrow("tenant context");
    expect(() => validateSourceWorkbookUploadIntent({ uploadIntent: result.uploadIntent, actor: { id: "user-a", tenantId: "tenant-b" }, secret, now })).toThrow("tenant context");
    expect(() => validateSourceWorkbookUploadIntent({ uploadIntent: result.uploadIntent, actor, secret, now: now + 60 * 60 * 1000 })).toThrow("expired");
    expect(() => validateSourceWorkbookUploadIntent({ uploadIntent: `${result.uploadIntent}tampered`, actor, secret, now })).toThrow("invalid");
  });
});
