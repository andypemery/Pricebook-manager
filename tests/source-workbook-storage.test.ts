import { describe, expect, it } from "vitest";
import { createInMemorySourceWorkbookStorage, sourceWorkbookExtension, sourceWorkbookStorageKey } from "../lib/data-mapper/source-workbook-storage";

describe("private source workbook storage", () => {
  it("uses server-controlled tenant and source scoped keys", () => {
    expect(sourceWorkbookStorageKey("tenant-a", "source-a", "xlsx")).toBe("source-workbooks/tenant-a/source-a/original.xlsx");
    expect(sourceWorkbookExtension("Pricebook.XLSM")).toBe("xlsm");
    expect(sourceWorkbookExtension("Pricebook.csv")).toBeNull();
  });

  it("simulates an exact-path private direct upload without a live Blob account", async () => {
    const storage = createInMemorySourceWorkbookStorage();
    const storageKey = "source-workbooks/tenant-a/source-a/original.xlsx";
    const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const authorisation = await storage.authoriseUpload({ storageKey, contentType, maximumSizeInBytes: 3, validUntil: 2_000 });
    await storage.uploadDirect({ uploadUrl: authorisation.uploadUrl, bytes: new Uint8Array([1, 2, 3]), contentType, now: 1_000 });

    expect(await storage.head(storageKey)).toMatchObject({ storageKey, size: 3, contentType, access: "private" });
    expect(await storage.get(storageKey)).toEqual(new Uint8Array([1, 2, 3]));
    await storage.delete(storageKey);
    expect(await storage.get(storageKey)).toBeNull();
  });

  it("rejects expired, oversized, wrong-type and duplicate direct uploads", async () => {
    const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const expired = createInMemorySourceWorkbookStorage();
    const expiredAuth = await expired.authoriseUpload({ storageKey: "expired.xlsx", contentType, maximumSizeInBytes: 3, validUntil: 10 });
    await expect(expired.uploadDirect({ uploadUrl: expiredAuth.uploadUrl, bytes: new Uint8Array([1]), contentType, now: 10 })).rejects.toThrow("expired");

    const oversized = createInMemorySourceWorkbookStorage();
    const oversizedAuth = await oversized.authoriseUpload({ storageKey: "oversized.xlsx", contentType, maximumSizeInBytes: 2, validUntil: 10 });
    await expect(oversized.uploadDirect({ uploadUrl: oversizedAuth.uploadUrl, bytes: new Uint8Array([1, 2, 3]), contentType, now: 1 })).rejects.toThrow("size");

    const wrongType = createInMemorySourceWorkbookStorage();
    const wrongTypeAuth = await wrongType.authoriseUpload({ storageKey: "wrong-type.xlsx", contentType, maximumSizeInBytes: 3, validUntil: 10 });
    await expect(wrongType.uploadDirect({ uploadUrl: wrongTypeAuth.uploadUrl, bytes: new Uint8Array([1]), contentType: "application/x-msdownload", now: 1 })).rejects.toThrow("content type");

    const duplicate = createInMemorySourceWorkbookStorage();
    const duplicateAuth = await duplicate.authoriseUpload({ storageKey: "duplicate.xlsx", contentType, maximumSizeInBytes: 3, validUntil: 10 });
    await duplicate.uploadDirect({ uploadUrl: duplicateAuth.uploadUrl, bytes: new Uint8Array([1]), contentType, now: 1 });
    await expect(duplicate.uploadDirect({ uploadUrl: duplicateAuth.uploadUrl, bytes: new Uint8Array([2]), contentType, now: 1 })).rejects.toThrow("already exists");
  });
});
