import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { finaliseSourceWorkbookUpload } from "../lib/data-mapper/output-profiles/source-import";
import { sourceWorkbookContentTypes } from "../lib/data-mapper/source-workbook-policy";
import { createInMemorySourceWorkbookStorage, sourceWorkbookStorageKey } from "../lib/data-mapper/source-workbook-storage";
import { authoriseSourceWorkbookUpload } from "../lib/data-mapper/source-workbook-upload";

const actor = { id: "user-1", tenantId: "tenant-1" };
const secret = "test-source-upload-secret-that-is-long-enough";
const now = Date.parse("2026-09-16T12:00:00Z");
const newUploadId = "22222222-2222-4222-8222-222222222222";

async function workbookBytes(headers = ["SKU", "Description", "Price"]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");
  worksheet.addRows([headers, ["A", "Alpha", 10], ["B", "Beta", 20]]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function seed(storage: ReturnType<typeof createInMemorySourceWorkbookStorage>, storageKey: string, bytes: Uint8Array) {
  const contentType = sourceWorkbookContentTypes.xlsx;
  const authorisation = await storage.authoriseUpload({ storageKey, contentType, maximumSizeInBytes: 20 * 1024 * 1024, validUntil: now + 60_000 });
  await storage.uploadDirect({ uploadUrl: authorisation.uploadUrl, bytes, contentType, now });
}

describe("source workbook re-upload replacement", () => {
  it("validates a fresh immutable object, switches transactionally, clears ignores, then removes the old object", async () => {
    const storage = createInMemorySourceWorkbookStorage();
    const bytes = await workbookBytes();
    const oldStorageKey = sourceWorkbookStorageKey(actor.tenantId, "source-existing", "xlsx");
    await seed(storage, oldStorageKey, bytes);
    const events: string[] = [];
    const originalDelete = storage.delete.bind(storage);
    storage.delete = async (storageKey) => { events.push(`delete:${storageKey}`); await originalDelete(storageKey); };

    const existing = {
      id: "source-existing",
      projectId: "project-1",
      originalFileName: "old.xlsx",
      fileReference: { id: "file-old", storageKey: oldStorageKey },
      worksheets: [{ id: "worksheet-existing", name: "Products", headers: ["SKU", "Description", "Price"] }]
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: existing.id, projectId: existing.projectId })
      .mockResolvedValueOnce(existing);
    const clearOverrides = vi.fn(async () => { events.push("clear-overrides"); return { count: 2 }; });
    const clearExclusions = vi.fn(async () => { events.push("clear-exclusions"); return { count: 3 }; });
    const updateWorksheet = vi.fn(async () => { events.push("update-worksheet"); return {}; });
    const transactionClient = {
      fileReference: { create: vi.fn(async () => ({ id: "file-new" })) },
      sourceWorksheet: { update: updateWorksheet, create: vi.fn(async () => ({})) },
      validationIssueOverride: { deleteMany: clearOverrides },
      sourceWorkbookRowExclusion: { deleteMany: clearExclusions, createMany: vi.fn() },
      project: { update: vi.fn(async () => ({ id: "project-1" })) },
      sourceWorkbookImport: { update: vi.fn(async () => {
        events.push("switch-source-reference");
        expect(await storage.head(oldStorageKey)).not.toBeNull();
        return { ...existing, originalFileName: "replacement.xlsx", fileReference: { id: "file-new", storageKey: sourceWorkbookStorageKey(actor.tenantId, newUploadId, "xlsx") } };
      }) }
    };
    const transaction = vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient));
    const deleteOldReference = vi.fn(async () => { events.push("delete-old-reference"); return { count: 1 }; });
    const db = {
      project: { findFirst: vi.fn(async () => ({ id: "project-1", sourceWorkbookImports: [{ id: existing.id }] })) },
      sourceWorkbookImport: { findFirst },
      $transaction: transaction,
      fileReference: { deleteMany: deleteOldReference }
    } as unknown as PrismaClient;

    const authorisation = await authoriseSourceWorkbookUpload(db, actor, {
      fileName: "replacement.xlsx",
      fileSizeBytes: bytes.byteLength,
      contentType: sourceWorkbookContentTypes.xlsx,
      projectId: "project-1",
      replaceSourceWorkbookImportId: existing.id
    }, { storage, secret, now, uploadId: newUploadId });
    await storage.uploadDirect({ uploadUrl: authorisation.uploadUrl, bytes, contentType: sourceWorkbookContentTypes.xlsx, now });

    await finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret, now });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(clearOverrides).toHaveBeenCalledWith({ where: { tenantId: actor.tenantId, sourceWorkbookImportId: existing.id } });
    expect(clearExclusions).toHaveBeenCalledWith({ where: { tenantId: actor.tenantId, sourceWorkbookImportId: existing.id } });
    expect(updateWorksheet).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "worksheet-existing" } }));
    expect(events.indexOf("switch-source-reference")).toBeLessThan(events.indexOf(`delete:${oldStorageKey}`));
    expect(await storage.head(oldStorageKey)).toBeNull();
    expect(deleteOldReference).toHaveBeenCalled();
  });

  it("keeps the known-good source when replacement headings are incompatible", async () => {
    const storage = createInMemorySourceWorkbookStorage();
    const oldBytes = await workbookBytes();
    const replacementBytes = await workbookBytes(["SKU", "Different heading", "Price"]);
    const oldStorageKey = sourceWorkbookStorageKey(actor.tenantId, "source-existing", "xlsx");
    await seed(storage, oldStorageKey, oldBytes);
    const existing = {
      id: "source-existing",
      projectId: "project-1",
      originalFileName: "old.xlsx",
      fileReference: { id: "file-old", storageKey: oldStorageKey },
      worksheets: [{ id: "worksheet-existing", name: "Products", headers: ["SKU", "Description", "Price"] }]
    };
    const findFirst = vi.fn().mockResolvedValueOnce({ id: existing.id, projectId: existing.projectId }).mockResolvedValueOnce(existing);
    const transaction = vi.fn();
    const db = { project: { findFirst: vi.fn(async () => ({ id: "project-1", sourceWorkbookImports: [{ id: existing.id }] })) }, sourceWorkbookImport: { findFirst }, $transaction: transaction } as unknown as PrismaClient;
    const authorisation = await authoriseSourceWorkbookUpload(db, actor, {
      fileName: "replacement.xlsx",
      fileSizeBytes: replacementBytes.byteLength,
      contentType: sourceWorkbookContentTypes.xlsx,
      projectId: "project-1",
      replaceSourceWorkbookImportId: existing.id
    }, { storage, secret, now, uploadId: newUploadId });
    await storage.uploadDirect({ uploadUrl: authorisation.uploadUrl, bytes: replacementBytes, contentType: sourceWorkbookContentTypes.xlsx, now });

    await expect(finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret, now }))
      .rejects.toThrow("retain the existing headings");
    expect(transaction).not.toHaveBeenCalled();
    expect(await storage.head(oldStorageKey)).not.toBeNull();
    expect(await storage.head(sourceWorkbookStorageKey(actor.tenantId, newUploadId, "xlsx"))).toBeNull();
  });

  it("rejects finalisation when the existing source Project no longer matches the signed replacement intent", async () => {
    const storage = createInMemorySourceWorkbookStorage();
    const bytes = await workbookBytes();
    const oldStorageKey = sourceWorkbookStorageKey(actor.tenantId, "source-existing", "xlsx");
    await seed(storage, oldStorageKey, bytes);
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: "source-existing", projectId: "project-1" })
      .mockResolvedValueOnce({
        id: "source-existing",
        projectId: "project-2",
        originalFileName: "old.xlsx",
        fileReference: { id: "file-old", storageKey: oldStorageKey },
        worksheets: [{ id: "worksheet-existing", name: "Products", headers: ["SKU", "Description", "Price"] }]
      });
    const transaction = vi.fn();
    const db = {
      project: { findFirst: vi.fn(async () => ({ id: "project-1", sourceWorkbookImports: [{ id: "source-existing" }] })) },
      sourceWorkbookImport: { findFirst },
      $transaction: transaction
    } as unknown as PrismaClient;
    const authorisation = await authoriseSourceWorkbookUpload(db, actor, {
      fileName: "replacement.xlsx",
      fileSizeBytes: bytes.byteLength,
      contentType: sourceWorkbookContentTypes.xlsx,
      projectId: "project-1",
      replaceSourceWorkbookImportId: "source-existing"
    }, { storage, secret, now, uploadId: newUploadId });
    await storage.uploadDirect({ uploadUrl: authorisation.uploadUrl, bytes, contentType: sourceWorkbookContentTypes.xlsx, now });

    await expect(finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret, now }))
      .rejects.toThrow("must remain in its existing Project");
    expect(transaction).not.toHaveBeenCalled();
    expect(await storage.head(oldStorageKey)).not.toBeNull();
    expect(await storage.head(sourceWorkbookStorageKey(actor.tenantId, newUploadId, "xlsx"))).toBeNull();
  });
});
