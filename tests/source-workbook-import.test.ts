import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { finaliseSourceWorkbookUpload } from "../lib/data-mapper/output-profiles/source-import";
import { sourceWorkbookContentTypes } from "../lib/data-mapper/source-workbook-policy";
import { createInMemorySourceWorkbookStorage } from "../lib/data-mapper/source-workbook-storage";
import { authoriseSourceWorkbookUpload } from "../lib/data-mapper/source-workbook-upload";
import { validationIssueFingerprint } from "../lib/data-mapper/validation/validation-engine";

const actor = { id: "user-1", tenantId: "tenant-1" };
const intentSecret = "test-source-upload-secret-that-is-long-enough";
const now = Date.parse("2026-09-16T12:00:00Z");

async function workbookBytes(headers = ["Product Code", "Description", "List Price"]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");
  worksheet.addRows([
    headers,
    ["A", "Alpha", 10],
    ["B", "Beta", 20],
    ["C", "Gamma", 30],
    ["D", "Delta", 40]
  ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function newImportDatabase() {
  const findFirst = vi.fn(async (): Promise<unknown> => null);
  const createFileReference = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "file-1", ...data }));
  const createSourceImport = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const nested = data.worksheets as { create: Array<Record<string, unknown>> };
    return {
      ...data,
      worksheets: nested.create.map((worksheet, index) => ({ id: `worksheet-${index}`, ...worksheet }))
    };
  });
  const createValidationOverrides = vi.fn(async () => ({ count: 1 }));
  const projectFindFirst = vi.fn(async () => ({ id: "project-1", sourceWorkbookImports: [] as Array<{ id: string }> }));
  const transactionClient = {
    fileReference: { create: createFileReference },
    sourceWorkbookImport: { create: createSourceImport },
    validationIssueOverride: { createMany: createValidationOverrides },
    project: { update: vi.fn(async () => ({ id: "project-1" })) }
  };
  const transaction = vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient));
  const db = {
    project: { findFirst: projectFindFirst },
    sourceWorkbookImport: { findFirst },
    $transaction: transaction
  } as unknown as PrismaClient;
  return { db, createFileReference, createSourceImport, createValidationOverrides, transaction, findFirst, projectFindFirst };
}

async function authoriseAndUpload(options: {
  db: PrismaClient;
  bytes: Uint8Array;
  fileName?: string;
  replaceSourceWorkbookImportId?: string;
}) {
  const storage = createInMemorySourceWorkbookStorage();
  const fileName = options.fileName ?? "pricebook.xlsx";
  const contentType = sourceWorkbookContentTypes.xlsx;
  const authorisation = await authoriseSourceWorkbookUpload(options.db, actor, {
    fileName,
    fileSizeBytes: options.bytes.byteLength,
    contentType,
    projectId: "project-1",
    replaceSourceWorkbookImportId: options.replaceSourceWorkbookImportId
  }, { storage, secret: intentSecret, now, uploadId: "11111111-1111-4111-8111-111111111111" });
  await storage.uploadDirect({ uploadUrl: authorisation.uploadUrl, bytes: options.bytes, contentType, now });
  return { storage, authorisation };
}

describe("source workbook direct-upload finalisation", () => {
  it("validates once and persists only private metadata, headings and three representative rows", async () => {
    const { db, createFileReference, createSourceImport } = newImportDatabase();
    const bytes = await workbookBytes();
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });

    const result = await finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now });

    const sourceData = createSourceImport.mock.calls[0]?.[0].data;
    const worksheetData = (sourceData.worksheets as { create: Array<{ headers: string[]; sampleRows: string[][] }> }).create[0];
    expect(sourceData.tenantId).toBe("tenant-1");
    expect(worksheetData.headers).toEqual(["Product Code", "Description", "List Price"]);
    expect(worksheetData.sampleRows).toEqual([
      ["A", "Alpha", "10"],
      ["B", "Beta", "20"],
      ["C", "Gamma", "30"]
    ]);
    expect(worksheetData.sampleRows).toHaveLength(3);
    expect(sourceData).not.toHaveProperty("fileContents");
    expect(sourceData).not.toHaveProperty("rows");
    expect(createFileReference).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ visibility: "private", storageKey: expect.stringContaining("source-workbooks/tenant-1/") }) }));
    expect(result).toMatchObject({ id: "11111111-1111-4111-8111-111111111111" });
  });

  it("rejects a missing upload and does not create database records", async () => {
    const { db, createSourceImport } = newImportDatabase();
    const storage = createInMemorySourceWorkbookStorage();
    const bytes = await workbookBytes();
    const authorisation = await authoriseSourceWorkbookUpload(db, actor, {
      fileName: "pricebook.xlsx",
      fileSizeBytes: bytes.byteLength,
      contentType: sourceWorkbookContentTypes.xlsx,
      projectId: "project-1"
    }, { storage, secret: intentSecret, now });

    await expect(finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now }))
      .rejects.toThrow("direct upload did not complete");
    expect(createSourceImport).not.toHaveBeenCalled();
  });

  it("rejects renamed arbitrary content and removes the unregistered private object", async () => {
    const { db } = newImportDatabase();
    const bytes = new TextEncoder().encode("not an Excel workbook");
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });

    await expect(finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now }))
      .rejects.toThrow();
    const issuedPath = "source-workbooks/tenant-1/11111111-1111-4111-8111-111111111111/original.xlsx";
    expect(await storage.head(issuedPath)).toBeNull();
  });

  it("rejects manufactured validation-ignore fingerprints before source registration", async () => {
    const { db, createSourceImport } = newImportDatabase();
    const bytes = await workbookBytes();
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });
    await expect(finaliseSourceWorkbookUpload(db, actor, {
      uploadIntent: authorisation.uploadIntent,
      ignoredValidationFingerprints: ["not-from-this-workbook"]
    }, { storage, secret: intentSecret, now })).rejects.toThrow("do not belong to this uploaded workbook");
    expect(createSourceImport).not.toHaveBeenCalled();
  });

  it("persists only a revalidated blocking fingerprint selected in the browser preview", async () => {
    const { db, createValidationOverrides } = newImportDatabase();
    const bytes = await workbookBytes();
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });
    const fingerprint = validationIssueFingerprint({
      worksheetName: "Products",
      rowNumber: 2,
      field: "Cost price",
      category: "missing-required-field",
      severity: "Error",
      currentValue: ""
    });
    await finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent, ignoredValidationFingerprints: [fingerprint] }, { storage, secret: intentSecret, now });
    expect(createValidationOverrides).toHaveBeenCalledWith({ data: [{
      tenantId: "tenant-1",
      sourceWorkbookImportId: "11111111-1111-4111-8111-111111111111",
      issueFingerprint: fingerprint,
      ignoredById: "user-1"
    }] });
  });

  it("rejects metadata for a different path instead of trusting client completion", async () => {
    const { db } = newImportDatabase();
    const bytes = await workbookBytes();
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });
    const deleteObject = vi.fn(async () => undefined);
    const mismatchedStorage = {
      ...storage,
      head: vi.fn(async () => ({
        storageKey: "source-workbooks/tenant-b/other/original.xlsx",
        url: "memory://wrong-object",
        size: bytes.byteLength,
        contentType: sourceWorkbookContentTypes.xlsx,
        etag: "wrong",
        access: "private" as const
      })),
      delete: deleteObject
    };

    await expect(finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage: mismatchedStorage, secret: intentSecret, now }))
      .rejects.toThrow("authorised private storage path");
    expect(deleteObject).toHaveBeenCalledWith("source-workbooks/tenant-1/11111111-1111-4111-8111-111111111111/original.xlsx");
  });

  it("treats a completed registration retry as idempotent", async () => {
    const { db, createSourceImport, findFirst, projectFindFirst } = newImportDatabase();
    const bytes = await workbookBytes();
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });
    const first = await finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now });
    findFirst.mockResolvedValueOnce({
      id: first.id,
      projectId: "project-1",
      originalFileName: "pricebook.xlsx",
      fileReference: { id: "file-1", storageKey: "source-workbooks/tenant-1/11111111-1111-4111-8111-111111111111/original.xlsx" },
      worksheets: first.worksheets
    });
    projectFindFirst.mockResolvedValueOnce({ id: "project-1", sourceWorkbookImports: [{ id: first.id }] });

    const retried = await finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now });
    expect(retried.id).toBe(first.id);
    expect(createSourceImport).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid uploaded object available when database registration fails so finalisation can be retried", async () => {
    const bytes = await workbookBytes();
    const failingDb = {
      project: { findFirst: vi.fn(async () => ({ id: "project-1", sourceWorkbookImports: [] })) },
      sourceWorkbookImport: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async () => { throw new Error("database temporarily unavailable"); })
    } as unknown as PrismaClient;
    const { storage, authorisation } = await authoriseAndUpload({ db: failingDb, bytes });
    const storageKey = "source-workbooks/tenant-1/11111111-1111-4111-8111-111111111111/original.xlsx";

    await expect(finaliseSourceWorkbookUpload(failingDb, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now }))
      .rejects.toThrow("database temporarily unavailable");
    expect(await storage.head(storageKey)).not.toBeNull();

    const { db: recoveredDb } = newImportDatabase();
    await expect(finaliseSourceWorkbookUpload(recoveredDb, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now }))
      .resolves.toMatchObject({ id: "11111111-1111-4111-8111-111111111111" });
  });

  it("rejects and cleans up a raced new upload if the Project gains a current workbook before finalisation", async () => {
    const { db, transaction, projectFindFirst } = newImportDatabase();
    const bytes = await workbookBytes();
    const { storage, authorisation } = await authoriseAndUpload({ db, bytes });
    projectFindFirst.mockResolvedValueOnce({ id: "project-1", sourceWorkbookImports: [{ id: "source-existing" }] });

    await expect(finaliseSourceWorkbookUpload(db, actor, { uploadIntent: authorisation.uploadIntent }, { storage, secret: intentSecret, now }))
      .rejects.toThrow("Use Replace workbook");
    expect(transaction).not.toHaveBeenCalled();
    expect(await storage.head("source-workbooks/tenant-1/11111111-1111-4111-8111-111111111111/original.xlsx")).toBeNull();
  });
});
