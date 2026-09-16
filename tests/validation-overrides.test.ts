import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../lib/data-mapper/source-workbook-storage", () => ({ getSourceWorkbookStorage: () => storage }));

import { changeValidationIssueOverrides, loadSourceValidationState } from "../lib/data-mapper/validation-overrides";

beforeAll(async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Products").addRows([
    ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner"],
    ["A", "Alpha", "10", "not-a-price", "NHS", "Supplier"]
  ]);
  storage.get.mockResolvedValue(new Uint8Array(await workbook.xlsx.writeBuffer()));
});

function database() {
  const ignored = new Set<string>();
  const findMany = vi.fn(async ({ where }: { where: { issueFingerprint: { in: string[] } } }) => where.issueFingerprint.in
    .filter((fingerprint) => ignored.has(fingerprint))
    .map((issueFingerprint) => ({ issueFingerprint, ignoredAt: new Date(), ignoredById: "user-1" })));
  const upsert = vi.fn(async ({ create }: { create: { issueFingerprint: string } }) => { ignored.add(create.issueFingerprint); return create; });
  const deleteMany = vi.fn(async ({ where }: { where: { issueFingerprint: { in: string[] } } }) => {
    where.issueFingerprint.in.forEach((fingerprint) => ignored.delete(fingerprint));
    return { count: where.issueFingerprint.in.length };
  });
  const db = {
    sourceWorkbookImport: { findFirst: vi.fn(async () => ({ id: "source-1", originalFileName: "pricebook.xlsx", fileReference: { storageKey: "private/source.xlsx", fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })) },
    validationIssueOverride: { findMany, upsert, deleteMany },
    $transaction: vi.fn(async (promises: Promise<unknown>[]) => Promise.all(promises))
  } as unknown as PrismaClient;
  return { db, upsert, deleteMany };
}

describe("tenant-scoped validation overrides", () => {
  it("revalidates fingerprints and supports Ignore and Restore without persisting source rows", async () => {
    const { db, upsert, deleteMany } = database();
    const initial = await loadSourceValidationState(db, "tenant-1", "source-1");
    expect(initial).toMatchObject({ blockingCount: 1, ignoredBlockingCount: 0, unresolvedBlockingCount: 1 });
    const fingerprint = initial.issues[0].fingerprint;

    const ignored = await changeValidationIssueOverrides(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [fingerprint], "IGNORE");
    expect(ignored).toMatchObject({ blockingCount: 1, ignoredBlockingCount: 1, unresolvedBlockingCount: 0 });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ tenantId: "tenant-1", sourceWorkbookImportId: "source-1", ignoredById: "user-1" }) }));

    const restored = await changeValidationIssueOverrides(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [fingerprint], "RESTORE");
    expect(restored).toMatchObject({ ignoredBlockingCount: 0, unresolvedBlockingCount: 1 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", sourceWorkbookImportId: "source-1", issueFingerprint: { in: [fingerprint] } } });
  });

  it("rejects a fingerprint that is not derived from the current private workbook", async () => {
    const { db, upsert } = database();
    await expect(changeValidationIssueOverrides(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", ["manufactured"], "IGNORE"))
      .rejects.toThrow("do not belong to this current source workbook");
    expect(upsert).not.toHaveBeenCalled();
  });
});
