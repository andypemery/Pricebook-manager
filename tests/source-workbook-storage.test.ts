import { describe, expect, it } from "vitest";
import { createInMemorySourceWorkbookStorage, sourceWorkbookExtension, sourceWorkbookStorageKey } from "../lib/data-mapper/source-workbook-storage";

describe("private source workbook storage", () => {
  it("uses server-controlled tenant and source scoped keys", () => {
    expect(sourceWorkbookStorageKey("tenant-a", "source-a", "xlsx")).toBe("source-workbooks/tenant-a/source-a/original.xlsx");
    expect(sourceWorkbookExtension("Pricebook.XLSM")).toBe("xlsm");
    expect(sourceWorkbookExtension("Pricebook.csv")).toBeNull();
  });

  it("keeps test binaries in the in-memory adapter only", async () => {
    const storage = createInMemorySourceWorkbookStorage();
    await storage.put({ storageKey: "source-workbooks/tenant-a/source-a/original.xlsx", bytes: new Uint8Array([1, 2, 3]), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(await storage.get("source-workbooks/tenant-a/source-a/original.xlsx")).toEqual(new Uint8Array([1, 2, 3]));
    await storage.delete("source-workbooks/tenant-a/source-a/original.xlsx");
    expect(await storage.get("source-workbooks/tenant-a/source-a/original.xlsx")).toBeNull();
  });
});
