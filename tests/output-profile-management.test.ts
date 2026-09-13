import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  deleteOutputProfileForTenant,
  duplicateOutputProfileForTenant,
  listOutputProfileWorkspace,
  loadOutputProfileBuilder,
  OutputProfileNotFoundError
} from "../lib/data-mapper/output-profiles/repository";

const actor = { id: "user-1", tenantId: "tenant-1" };

function storedProfile(name = "NHS Contract") {
  return {
    name,
    filenameTemplate: "{profile}_{month}_{year}",
    outputFormat: "CSV",
    csvDelimiter: "PIPE",
    csvIncludeHeader: false,
    xlsxWorksheetName: null,
    filterMatchMode: "ALL",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [{
      columnType: "SOURCE",
      sourceColumnIndex: 0,
      sourceHeading: "Product Code",
      outputHeading: "MATERIAL",
      staticValue: null,
      adjustmentType: "MULTIPLY",
      adjustmentValue: "0.82",
      roundingDecimalPlaces: 2
    }, {
      columnType: "STATIC",
      sourceColumnIndex: null,
      sourceHeading: null,
      outputHeading: "CURRENCY",
      staticValue: "GBP",
      adjustmentType: "NONE",
      adjustmentValue: null,
      roundingDecimalPlaces: null
    }],
    filters: [{ sourceColumnIndex: 1, sourceHeading: "Eligible", operator: "EQUALS", comparisonValue: "Yes" }]
  };
}

describe("reusable Output Profile management", () => {
  it("duplicates the complete compact definition as independent relational records", async () => {
    const original = storedProfile();
    const create = vi.fn().mockResolvedValue({ id: "profile-copy", name: "NHS Contract - Copy", updatedAt: new Date() });
    const db = {
      outputProfile: { findFirst: vi.fn().mockResolvedValue(original), create },
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({
        headers: ["Product Code", "Eligible"],
        sourceWorkbookImport: { originalFileName: "Supplier.xlsx" }
      }) }
    } as unknown as PrismaClient;

    const duplicate = await duplicateOutputProfileForTenant(db, actor, "profile-1");
    const data = create.mock.calls[0]?.[0].data;

    expect(duplicate.id).toBe("profile-copy");
    expect(data).toMatchObject({
      tenantId: "tenant-1",
      createdById: "user-1",
      name: "NHS Contract - Copy",
      filenameTemplate: "{profile}_{month}_{year}",
      outputFormat: "CSV",
      csvDelimiter: "PIPE",
      csvIncludeHeader: false
    });
    expect(data.columns.create).toHaveLength(2);
    expect(data.filters.create).toHaveLength(1);
    expect(data.columns.create[0]).not.toBe(original.columns[0]);
    expect(original.name).toBe("NHS Contract");
  });

  it("rejects cross-tenant duplication before any write", async () => {
    const create = vi.fn();
    const db = { outputProfile: { findFirst: vi.fn().mockResolvedValue(null), create } } as unknown as PrismaClient;

    await expect(duplicateOutputProfileForTenant(db, actor, "other-profile")).rejects.toBeInstanceOf(OutputProfileNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });

  it("deletes only the tenant-owned profile without touching its source or sibling profiles", async () => {
    const remove = vi.fn().mockResolvedValue({ id: "profile-1" });
    const sourceDelete = vi.fn();
    const db = {
      outputProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: "profile-1", name: "NHS", sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1" }),
        delete: remove
      },
      sourceWorkbookImport: { delete: sourceDelete }
    } as unknown as PrismaClient;

    await deleteOutputProfileForTenant(db, "tenant-1", "profile-1");

    expect(remove).toHaveBeenCalledWith({ where: { id: "profile-1" } });
    expect(sourceDelete).not.toHaveBeenCalled();
    expect((db.outputProfile.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].where).toEqual({ id: "profile-1", tenantId: "tenant-1" });
  });

  it("rejects cross-tenant deletion before the delete operation", async () => {
    const remove = vi.fn();
    const db = { outputProfile: { findFirst: vi.fn().mockResolvedValue(null), delete: remove } } as unknown as PrismaClient;

    await expect(deleteOutputProfileForTenant(db, "tenant-1", "other-profile")).rejects.toBeInstanceOf(OutputProfileNotFoundError);
    expect(remove).not.toHaveBeenCalled();
  });

  it("lists multiple profiles in one compact tenant-scoped query without source rows", async () => {
    const findProfiles = vi.fn().mockResolvedValue([
      { id: "profile-1", name: "NHS", sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1", outputFormat: "CSV", updatedAt: new Date(), _count: { columns: 2 }, sourceWorkbookImport: { originalFileName: "Supplier.xlsx" }, sourceWorksheet: { name: "Products" } },
      { id: "profile-2", name: "Education", sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1", outputFormat: "XLSX", updatedAt: new Date(), _count: { columns: 3 }, sourceWorkbookImport: { originalFileName: "Supplier.xlsx" }, sourceWorksheet: { name: "Products" } }
    ]);
    const db = {
      outputProfile: { findMany: findProfiles },
      sourceWorkbookImport: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;

    const workspace = await listOutputProfileWorkspace(db, "tenant-1");

    expect(workspace.profiles.map((profile) => profile.name)).toEqual(["NHS", "Education"]);
    expect(findProfiles.mock.calls[0]?.[0].where).toEqual({ tenantId: "tenant-1" });
    expect(findProfiles.mock.calls[0]?.[0].select.sourceWorksheet.select).toEqual({ name: true });
  });

  it("switches by loading independent tenant-scoped profile definitions", async () => {
    const first = {
      id: "profile-1", ...storedProfile("NHS"),
      sourceWorkbookImport: { originalFileName: "Supplier.xlsx" },
      sourceWorksheet: { id: "worksheet-1", name: "Products", headers: ["Product Code", "Eligible"], sampleRows: [["A", "Yes"]] },
      columns: [{ id: "column-1", ...storedProfile().columns[0] }],
      filters: []
    };
    const second = {
      ...first,
      id: "profile-2",
      name: "Education",
      filenameTemplate: "Education_{date}",
      columns: [{ id: "column-2", ...storedProfile().columns[0], outputHeading: "CODE" }]
    };
    const findFirst = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const db = { outputProfile: { findFirst } } as unknown as PrismaClient;

    const firstDraft = await loadOutputProfileBuilder(db, "tenant-1", { profileId: "profile-1" });
    const secondDraft = await loadOutputProfileBuilder(db, "tenant-1", { profileId: "profile-2" });

    expect(firstDraft?.draft).toMatchObject({ id: "profile-1", name: "NHS", filenameTemplate: "{profile}_{month}_{year}" });
    expect(secondDraft?.draft).toMatchObject({ id: "profile-2", name: "Education", filenameTemplate: "Education_{date}" });
    expect(firstDraft?.draft.columns[0].outputHeading).toBe("MATERIAL");
    expect(secondDraft?.draft.columns[0].outputHeading).toBe("CODE");
    expect(findFirst.mock.calls.map((call) => call[0].where)).toEqual([
      { id: "profile-1", tenantId: "tenant-1" },
      { id: "profile-2", tenantId: "tenant-1" }
    ]);
  });
});
