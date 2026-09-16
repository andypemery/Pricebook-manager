import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { createSourceWorkbookImportFromFile } from "../lib/data-mapper/output-profiles/source-import";
import { createInMemorySourceWorkbookStorage } from "../lib/data-mapper/source-workbook-storage";

describe("source workbook registration", () => {
  it("validates once and persists only headings plus three representative rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");
    worksheet.addRows([
      ["Product Code", "Description", "List Price"],
      ["A", "Alpha", 10],
      ["B", "Beta", 20],
      ["C", "Gamma", 30],
      ["D", "Delta", 40]
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([new Uint8Array(buffer)], "pricebook.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const create = vi.fn(async ({ data }) => ({
      id: "source-1",
      originalFileName: data.originalFileName,
      worksheets: data.worksheets.create.map((item: { name: string }, index: number) => ({ id: `worksheet-${index}`, ...item }))
    }));
    const fileReference = { create: vi.fn(async () => ({ id: "file-1" })), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) };
    const db = { sourceWorkbookImport: { create }, fileReference } as unknown as PrismaClient;

    await createSourceWorkbookImportFromFile(db, { id: "user-1", tenantId: "tenant-1" }, file, createInMemorySourceWorkbookStorage());

    const data = create.mock.calls[0]?.[0].data;
    expect(data.tenantId).toBe("tenant-1");
    expect(data.worksheets.create[0].headers).toEqual(["Product Code", "Description", "List Price"]);
    expect(data.worksheets.create[0].sampleRows).toEqual([
      ["A", "Alpha", "10"],
      ["B", "Beta", "20"],
      ["C", "Gamma", "30"]
    ]);
    expect(data.worksheets.create[0].sampleRows).toHaveLength(3);
    expect(data).not.toHaveProperty("fileContents");
    expect(data).not.toHaveProperty("rows");
    expect(fileReference.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ visibility: "private", storageKey: expect.stringContaining("source-workbooks/tenant-1/") }) }));
  });
});
