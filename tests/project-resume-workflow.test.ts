import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../lib/data-mapper/source-workbook-storage", () => ({ getSourceWorkbookStorage: () => storage }));

import { loadPersistedWorkbookReview } from "../lib/data-mapper/persisted-workbook-review";
import {
  changeSourceRowExclusions,
  changeValidationIssueOverrides,
  loadSourceValidationState,
  SourceWorkbookUnavailableError
} from "../lib/data-mapper/validation-overrides";
import type { SourceRowReference } from "../lib/data-mapper/source-row-exclusions";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

async function workbookBytes() {
  const workbook = new ExcelJS.Workbook();
  const products = workbook.addWorksheet("Products");
  products.addRow(["SKU", "Item description", "Cost price", "Sell price", "Margin percentage", "Framework", "Partner"]);
  products.addRow(["ERR-1", "Broken price", "10", "not-a-price", "", "NHS", "Supplier"]);
  products.addRow(["WARN-1", "Low margin", "10", "11", "", "NHS", "Supplier"]);
  for (let index = 4; index <= 106; index += 1) {
    products.addRow([`SKU-${index}`, `Product ${index}`, "10", "20", "", "NHS", "Supplier"]);
  }
  workbook.addWorksheet("Services").addRows([
    ["SKU", "Item description", "Cost price", "Sell price", "Margin percentage", "Framework", "Partner"],
    ["SERVICE-1", "Service", "20", "40", "", "NHS", "Supplier"]
  ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function database() {
  const ignored = new Set<string>();
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
  const worksheetMetadata = [
    { id: "worksheet-products", name: "Products", columnCount: 7 },
    { id: "worksheet-services", name: "Services", columnCount: 7 }
  ];
  const validationIssueOverride = {
    findMany: vi.fn(async ({ where }: { where: { issueFingerprint: { in: string[] } } }) => where.issueFingerprint.in
      .filter((fingerprint) => ignored.has(fingerprint))
      .map((issueFingerprint) => ({ issueFingerprint, ignoredAt: new Date("2026-09-19T10:00:00Z"), ignoredById: "user-1" }))),
    upsert: vi.fn(async ({ create }: { create: { issueFingerprint: string } }) => {
      ignored.add(create.issueFingerprint);
      return create;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { issueFingerprint: { in: string[] } } }) => {
      where.issueFingerprint.in.forEach((fingerprint) => ignored.delete(fingerprint));
      return { count: where.issueFingerprint.in.length };
    })
  };
  const exclusionDeleteMany = vi.fn(async ({ where }: { where: { OR?: Array<{ sourceWorksheetId: string; physicalRowNumber: number }> } }) => {
    const keys = where.OR ?? [];
    for (let index = exclusions.length - 1; index >= 0; index -= 1) {
      if (keys.some((key) => key.sourceWorksheetId === exclusions[index].sourceWorksheetId && key.physicalRowNumber === exclusions[index].physicalRowNumber)) {
        exclusions.splice(index, 1);
      }
    }
    return { count: keys.length };
  });
  const exclusionCreateMany = vi.fn(async ({ data }: { data: Array<Omit<(typeof exclusions)[number], "id" | "excludedAt" | "sourceWorksheet">> }) => {
    data.forEach((row) => {
      const worksheet = worksheetMetadata.find((item) => item.id === row.sourceWorksheetId)!;
      exclusions.push({
        ...row,
        id: `excluded-${exclusions.length + 1}`,
        excludedAt: new Date("2026-09-19T10:00:00Z"),
        sourceWorksheet: { name: worksheet.name, columnCount: worksheet.columnCount }
      });
    });
    return { count: data.length };
  });
  const sourceWorkbookRowExclusion = {
    findMany: vi.fn(async () => exclusions.map((row) => ({ ...row }))),
    deleteMany: exclusionDeleteMany,
    createMany: exclusionCreateMany
  };
  const transactionClient = { sourceWorkbookRowExclusion };
  const sourceFindFirst = vi.fn(async () => ({
    id: "source-1",
    projectId: "project-1",
    originalFileName: "pricebook.xlsx",
    fileSizeBytes: 123456,
    validatedAt: new Date("2026-09-19T09:00:00Z"),
    fileReference: { storageKey: "private/source.xlsx", fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    worksheets: worksheetMetadata
  }));
  const db = {
    sourceWorkbookImport: { findFirst: sourceFindFirst },
    validationIssueOverride,
    sourceWorkbookRowExclusion,
    $transaction: vi.fn(async (work: Promise<unknown>[] | ((transaction: typeof transactionClient) => Promise<unknown>)) => Array.isArray(work)
      ? Promise.all(work)
      : work(transactionClient))
  } as unknown as PrismaClient;
  return { db, sourceFindFirst };
}

function rowReference(state: Awaited<ReturnType<typeof loadSourceValidationState>>, rowNumber: number): SourceRowReference {
  const issue = state.detectedIssues.find((item) => item.worksheetName === "Products" && item.rowNumber === rowNumber);
  if (!issue) throw new Error(`Missing validation issue for row ${rowNumber}`);
  return { worksheetName: issue.worksheetName, physicalRowNumber: issue.rowNumber, rowFingerprint: issue.rowFingerprint };
}

describe("persisted Project workbook review", () => {
  beforeEach(async () => {
    storage.get.mockReset();
    storage.get.mockResolvedValue(await workbookBytes());
  });

  it("resumes ignored and deleted decisions from one Blob read with bounded previews", async () => {
    const { db, sourceFindFirst } = database();
    const initial = await loadSourceValidationState(db, "tenant-1", "source-1");
    const blockingIssue = initial.detectedIssues.find((issue) => issue.severity === "Error")!;
    await changeValidationIssueOverrides(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [blockingIssue.fingerprint], "IGNORE");
    await changeSourceRowExclusions(db, { id: "user-1", tenantId: "tenant-1" }, "source-1", [rowReference(initial, 3)], "EXCLUDE");

    storage.get.mockClear();
    const review = await loadPersistedWorkbookReview(db, "tenant-1", "project-1", "source-1");

    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(sourceFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "source-1", tenantId: "tenant-1", project: { tenantId: "tenant-1" } }
    }));
    expect(review.ignoredFingerprints).toContain(blockingIssue.fingerprint);
    expect(review.excludedRows).toEqual([expect.objectContaining({ worksheetName: "Products", physicalRowNumber: 3 })]);
    expect(review.worksheetPreviews).toHaveLength(2);
    expect(review.worksheetPreviews.every((preview) => preview.rows.length <= 100)).toBe(true);
    expect(review.worksheetPreviews.find((preview) => preview.worksheetName === "Products")?.rows).toHaveLength(100);
    expect(review.validation.issues.some((issue) => issue.rowNumber === 2)).toBe(true);
    expect(review.validation.issues.some((issue) => issue.rowNumber === 3)).toBe(true);
    expect(review).not.toHaveProperty("workbook");
    expect(review).not.toHaveProperty("bytes");
    expect(JSON.stringify(review)).not.toContain("private/source.xlsx");

    const resumed = await loadSourceValidationState(db, "tenant-1", "source-1");
    expect(resumed).toMatchObject({ ignoredBlockingCount: 1, unresolvedBlockingCount: 0, activeWarningCount: 0, excludedRowCount: 1 });
  });

  it("uses the explicit missing-source path instead of treating an existing Project as empty", async () => {
    const { db } = database();
    storage.get.mockResolvedValueOnce(null);
    await expect(loadPersistedWorkbookReview(db, "tenant-1", "project-1", "source-1")).rejects.toBeInstanceOf(SourceWorkbookUnavailableError);

    const route = source("app/(app)/projects/[projectId]/workbook/page.tsx");
    expect(route).toContain("This source workbook needs to be re-uploaded before it can be reviewed.");
    expect(route).toContain("Re-upload workbook");
  });

  it("rejects a same-tenant source that does not belong to the requested Project", async () => {
    const { db } = database();
    await expect(loadPersistedWorkbookReview(db, "tenant-1", "another-project", "source-1"))
      .rejects.toThrow("The source workbook is not available.");
  });

  it("keeps upload, persisted review and replacement as distinct route states", () => {
    const route = source("app/(app)/projects/[projectId]/workbook/page.tsx");
    const importer = source("components/data-mapper/workbook-importer.tsx");
    expect(route).toContain("if (!workbook || replace)");
    expect(route).toContain("loadPersistedWorkbookReview");
    expect(route).toContain("persistedReview={review}");
    expect(importer).toContain("persistedReview ? \"Review workbook\"");
    expect(importer).toContain("!persistedReview ? <section");
    expect(importer).toContain('worksheet: "All worksheets"');
    expect(importer).toContain("updateValidationIssueOverridesAction");
    expect(importer).toContain("updateSourceRowExclusionsAction");
    expect(importer).toContain('`/projects/${encodeURIComponent(projectId)}/workbook?source=${encodeURIComponent(result.sourceWorkbookImportId)}`');
  });
});

describe("Project resume hub and Build Output", () => {
  it("removes Project-page profile administration and keeps one resumable Build output action", () => {
    const project = source("app/(app)/projects/[projectId]/page.tsx");
    expect(project).toContain("Review workbook");
    expect(project).toContain("Replace workbook");
    expect(project).toContain("been used with this Project");
    expect(project).toContain(">Build output</Link>");
    expect(project).not.toContain("listAvailableOutputProfilesForProject");
    expect(project).not.toContain("Add existing Output Profile");
    expect(project).not.toContain("Add to Project");
    expect(project).not.toContain("Remove from Project");
    expect(project).not.toContain("Create New Output Profile");
  });

  it("resumes the latest associated profile while preserving all-tenant selector groups", () => {
    const project = source("app/(app)/projects/[projectId]/page.tsx");
    const repository = source("lib/data-mapper/projects/repository.ts");
    const manager = source("components/data-mapper/output-profile-manager.tsx");
    const actions = source("lib/actions/output-profile.actions.ts");
    expect(repository).toContain('orderBy: { updatedAt: "desc" }');
    expect(project).toContain("project.outputProfiles[0].outputProfile.id");
    expect(manager).toContain('<optgroup label="Used in this Project">');
    expect(manager).toContain('<optgroup label="Other reusable profiles">');
    expect(manager).toContain("associateOutputProfileWithProjectAction");
    expect(actions).toContain("projectOutputProfile.update");
    expect(actions).toContain("updatedAt: new Date()");
  });

  it("keeps Dashboard Continue Working routed through the Project hub", () => {
    const dashboard = source("app/(app)/dashboard/page.tsx");
    expect(dashboard).toContain('href={`/projects/${project.id}`}');
    expect(dashboard).not.toContain('href={`/projects/${project.id}/workbook`}');
  });
});
