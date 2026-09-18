import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../lib/data-mapper/source-workbook-storage", () => ({ getSourceWorkbookStorage: () => storage }));

import {
  changeSourceRowExclusions,
  loadSourceValidationState
} from "../lib/data-mapper/validation-overrides";
import type { SourceRowReference } from "../lib/data-mapper/source-row-exclusions";

beforeEach(async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Products").addRows([
    ["SKU", "Item description", "Cost price", "Sell price", "Margin percentage", "Framework", "Partner"],
    ["ERR-1", "Broken price", "10", "not-a-price", "", "NHS", "Supplier"],
    ["WARN-1", "Low margin", "10", "11", "", "NHS", "Supplier"]
  ]);
  storage.get.mockReset();
  storage.get.mockResolvedValue(new Uint8Array(await workbook.xlsx.writeBuffer()));
});

function database() {
  const exclusions: Array<{
    id: string;
    tenantId: string;
    sourceWorkbookImportId: string;
    sourceWorksheetId: string;
    physicalRowNumber: number;
    rowFingerprint: string;
    excludedById: string;
    excludedAt: Date;
    sourceWorksheet: { name: string; columnCount: number };
  }> = [];
  const findMany = vi.fn(async () => exclusions.map((row) => ({ ...row })));
  const deleteMany = vi.fn(async ({ where }: { where: { OR?: Array<{ sourceWorksheetId: string; physicalRowNumber: number }> } }) => {
    const keys = where.OR ?? [];
    const before = exclusions.length;
    for (let index = exclusions.length - 1; index >= 0; index -= 1) {
      if (keys.some((key) => key.sourceWorksheetId === exclusions[index].sourceWorksheetId && key.physicalRowNumber === exclusions[index].physicalRowNumber)) exclusions.splice(index, 1);
    }
    return { count: before - exclusions.length };
  });
  const createMany = vi.fn(async ({ data }: { data: Array<Omit<(typeof exclusions)[number], "id" | "excludedAt" | "sourceWorksheet">> }) => {
    data.forEach((row, index) => exclusions.push({ ...row, id: `excluded-${exclusions.length + index}`, excludedAt: new Date("2026-09-18T12:00:00Z"), sourceWorksheet: { name: "Products", columnCount: 7 } }));
    return { count: data.length };
  });
  const transactionClient = { sourceWorkbookRowExclusion: { deleteMany, createMany } };
  const db = {
    sourceWorkbookImport: { findFirst: vi.fn(async () => ({
      id: "source-1",
      projectId: "project-1",
      originalFileName: "pricebook.xlsx",
      fileReference: { storageKey: "private/source.xlsx", fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      worksheets: [{ id: "worksheet-1", name: "Products", columnCount: 7 }]
    })) },
    validationIssueOverride: { findMany: vi.fn(async () => []) },
    sourceWorkbookRowExclusion: { findMany, deleteMany, createMany },
    $transaction: vi.fn(async (callback: (transaction: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
  } as unknown as PrismaClient;
  return { db, exclusions, createMany, deleteMany };
}

function rowReference(state: Awaited<ReturnType<typeof loadSourceValidationState>>, rowNumber: number): SourceRowReference {
  const issue = state.detectedIssues.find((item) => item.rowNumber === rowNumber);
  if (!issue) throw new Error(`Missing issue row ${rowNumber}`);
  return { worksheetName: issue.worksheetName, physicalRowNumber: issue.rowNumber, rowFingerprint: issue.rowFingerprint };
}

describe("tenant-scoped source-row exclusions", () => {
  it("excludes error and warning rows once per physical row and removes them from active counts", async () => {
    const { db, createMany } = database();
    const initial = await loadSourceValidationState(db, "tenant-1", "source-1");
    expect(initial).toMatchObject({ activeErrorCount: 1, activeWarningCount: 1, excludedRowCount: 0 });
    const errorRow = rowReference(initial, 2);
    const warningRow = rowReference(initial, 3);

    await changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [errorRow, warningRow, errorRow], "EXCLUDE");
    const excluded = await loadSourceValidationState(db, "tenant-1", "source-1");

    expect(excluded).toMatchObject({ activeErrorCount: 0, activeWarningCount: 0, unresolvedBlockingCount: 0, excludedRowCount: 2 });
    expect(excluded.issues).toEqual([]);
    expect(createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ tenantId: "tenant-1", sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1", physicalRowNumber: 2, excludedById: "user-1" }),
      expect.objectContaining({ tenantId: "tenant-1", sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1", physicalRowNumber: 3, excludedById: "user-1" })
    ] });
    expect(createMany.mock.calls[0]?.[0].data[0]).not.toHaveProperty("cells");
  });

  it("restores one or all deleted rows without changing the private Blob", async () => {
    const { db, exclusions } = database();
    const initial = await loadSourceValidationState(db, "tenant-1", "source-1");
    const rows = [rowReference(initial, 2), rowReference(initial, 3)];
    await changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", rows, "EXCLUDE");
    await changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [rows[0]], "RESTORE");
    expect(exclusions.map((row) => row.physicalRowNumber)).toEqual([3]);
    await changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [rows[1]], "RESTORE");
    expect(exclusions).toEqual([]);
    expect(storage.get).toHaveBeenCalledWith("private/source.xlsx");
  });

  it("rejects manufactured fingerprints and cross-worksheet tampering", async () => {
    const { db, createMany } = database();
    const initial = await loadSourceValidationState(db, "tenant-1", "source-1");
    const valid = rowReference(initial, 2);
    await expect(changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [{ ...valid, rowFingerprint: "v1-0000000000000000" }], "EXCLUDE"))
      .rejects.toThrow("do not belong to this current source workbook");
    await expect(changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [{ ...valid, worksheetName: "Other" }], "EXCLUDE"))
      .rejects.toThrow("do not belong to this current source workbook");
    expect(createMany).not.toHaveBeenCalled();
  });
});
