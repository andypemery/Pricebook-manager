import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadOutputProfileBuilder, OutputProfileNotFoundError, saveOutputProfileForTenant } from "../lib/data-mapper/output-profiles/repository";
import { OutputProfileValidationError, validateOutputProfileInput } from "../lib/data-mapper/output-profiles/validation";

const actor = { id: "user-1", tenantId: "tenant-1" };

function sourceColumn(sourceColumnIndex: number, sourceHeading: string, outputHeading: string, overrides: Record<string, unknown> = {}) {
  return {
    columnType: "SOURCE" as const,
    sourceColumnIndex,
    sourceHeading,
    outputHeading,
    staticValue: "",
    adjustmentType: "NONE" as const,
    adjustmentValue: "",
    roundingDecimalPlaces: null,
    ...overrides
  };
}

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "NHS Contract",
    filenameTemplate: "{profile}_{month}_{year}",
    outputFormat: "CSV" as const,
    csvDelimiter: "COMMA" as const,
    csvIncludeHeader: true,
    xlsxWorksheetName: "",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [
      sourceColumn(0, "Product Code", "MATERIAL"),
      sourceColumn(1, "Description", "DESCRIPTION")
    ],
    filterMatchMode: "ALL" as const,
    filters: [],
    ...overrides
  };
}

describe("Output Profile persistence", () => {
  it("creates a tenant-owned profile with compact ordered column definitions", async () => {
    const create = vi.fn().mockResolvedValue({ id: "profile-1", name: "NHS Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "Description"], sourceWorkbookImport: { originalFileName: "pricebook.xlsx" } }) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    const result = await saveOutputProfileForTenant(db, actor, profileInput());

    expect(result.id).toBe("profile-1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        createdById: "user-1",
        filenameTemplate: "{profile}_{month}_{year}",
        outputFormat: "CSV",
        csvDelimiter: "COMMA",
        csvIncludeHeader: true,
        columns: { create: [
          expect.objectContaining({ position: 0, sourceHeading: "Product Code", outputHeading: "MATERIAL" }),
          expect.objectContaining({ position: 1, sourceHeading: "Description", outputHeading: "DESCRIPTION" })
        ] }
      })
    }));
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty("effectiveDate");
  });

  it("persists XLSX worksheet configuration without generating workbook data", async () => {
    const create = vi.fn().mockResolvedValue({ id: "profile-xlsx", name: "Education Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "Description"], sourceWorkbookImport: { originalFileName: "pricebook.xlsx" } }) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    await saveOutputProfileForTenant(db, actor, profileInput({
      name: "Education Contract",
      outputFormat: "XLSX",
      xlsxWorksheetName: "Education Pricing"
    }));

    expect(create.mock.calls[0]?.[0].data).toMatchObject({ outputFormat: "XLSX", xlsxWorksheetName: "Education Pricing" });
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty("generatedRows");
  });

  it("persists a blank optional XLSX worksheet name as null for derived naming", async () => {
    const create = vi.fn().mockResolvedValue({ id: "profile-xlsx", name: "Education Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "Description"], sourceWorkbookImport: { originalFileName: "pricebook.xlsx" } }) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    await saveOutputProfileForTenant(db, actor, profileInput({ outputFormat: "XLSX", xlsxWorksheetName: "" }));

    expect(create.mock.calls[0]?.[0].data).toMatchObject({ outputFormat: "XLSX", xlsxWorksheetName: null });
  });

  it("replaces stored columns in the supplied order when reordering or removing mappings", async () => {
    const update = vi.fn().mockResolvedValue({ id: "profile-1", name: "NHS Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "Description"], sourceWorkbookImport: { originalFileName: "pricebook.xlsx" } }) },
      outputProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: "profile-1" }),
        update
      }
    } as unknown as PrismaClient;

    await saveOutputProfileForTenant(db, actor, profileInput({
      id: "profile-1",
      name: "Education Contract",
      columns: [sourceColumn(1, "Description", "DESCRIPTION")]
    }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "profile-1" },
      data: expect.objectContaining({
        name: "Education Contract",
        columns: { deleteMany: {}, create: [expect.objectContaining({ position: 0, sourceColumnIndex: 1 })] }
      })
    }));
    expect((db.outputProfile.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].where).toEqual({
      id: "profile-1",
      tenantId: "tenant-1",
      sourceWorkbookImportId: "source-1",
      sourceWorksheetId: "worksheet-1"
    });
  });

  it("persists fixed values, canonical transformations and ordered filters as compact configuration", async () => {
    const create = vi.fn().mockResolvedValue({ id: "profile-2", name: "NHS Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "List Price", "NHS Eligible"], sourceWorkbookImport: { originalFileName: "pricebook.xlsx" } }) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    await saveOutputProfileForTenant(db, actor, profileInput({
      columns: [
        sourceColumn(1, "List Price", "PRICE", { adjustmentType: "PERCENT_DECREASE", adjustmentValue: "18", roundingDecimalPlaces: 2 }),
        {
          columnType: "STATIC",
          sourceColumnIndex: null,
          sourceHeading: null,
          outputHeading: "CURRENCY",
          staticValue: "GBP",
          adjustmentType: "NONE",
          adjustmentValue: "",
          roundingDecimalPlaces: null
        }
      ],
      filterMatchMode: "ANY",
      filters: [{ sourceColumnIndex: 2, sourceHeading: "NHS Eligible", operator: "EQUALS", comparisonValue: "Yes" }]
    }));

    const data = create.mock.calls[0]?.[0].data;
    expect(data.filterMatchMode).toBe("ANY");
    expect(data.columns.create).toEqual([
      expect.objectContaining({ columnType: "SOURCE", adjustmentType: "PERCENT_DECREASE", adjustmentValue: "18", roundingDecimalPlaces: 2, position: 0 }),
      expect.objectContaining({ columnType: "STATIC", staticValue: "GBP", sourceHeading: null, position: 1 })
    ]);
    expect(data.filters.create).toEqual([
      expect.objectContaining({ sourceColumnIndex: 2, sourceHeading: "NHS Eligible", operator: "EQUALS", comparisonValue: "Yes", position: 0 })
    ]);
  });

  it("reloads only headings, three-row preview metadata and compact profile configuration", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "profile-1",
      name: "NHS Contract",
      filenameTemplate: "NHS_{month}_{year}",
      outputFormat: "CSV",
      csvDelimiter: "PIPE",
      csvIncludeHeader: false,
      xlsxWorksheetName: null,
      filterMatchMode: "ANY",
      sourceWorkbookImportId: "source-1",
      sourceWorksheetId: "worksheet-1",
      sourceWorkbookImport: { originalFileName: "pricebook.xlsx" },
      sourceWorksheet: {
        id: "worksheet-1",
        name: "Products",
        headers: ["Product Code", "Description"],
        sampleRows: [["A", "Alpha"], ["B", "Beta"], ["C", "Gamma"]]
      },
      columns: [
        {
          id: "column-1",
          columnType: "SOURCE",
          sourceColumnIndex: 0,
          sourceHeading: "Product Code",
          outputHeading: "MATERIAL",
          staticValue: null,
          adjustmentType: "MULTIPLY",
          adjustmentValue: "0.82",
          roundingDecimalPlaces: 2
        },
        {
          id: "column-2",
          columnType: "STATIC",
          sourceColumnIndex: null,
          sourceHeading: null,
          outputHeading: "CURRENCY",
          staticValue: "GBP",
          adjustmentType: "NONE",
          adjustmentValue: null,
          roundingDecimalPlaces: null
        }
      ],
      filters: [{ id: "filter-1", sourceColumnIndex: 1, sourceHeading: "Description", operator: "CONTAINS", comparisonValue: "Alpha" }]
    });
    const db = { outputProfile: { findFirst } } as unknown as PrismaClient;

    const result = await loadOutputProfileBuilder(db, "tenant-1", { profileId: "profile-1" });

    expect(result?.source.sampleRows).toHaveLength(3);
    expect(result?.draft.columns[0]).toMatchObject({ sourceHeading: "Product Code", outputHeading: "MATERIAL" });
    expect(result?.draft.columns[1]).toMatchObject({ columnType: "STATIC", sourceHeading: null, outputHeading: "CURRENCY", staticValue: "GBP" });
    expect(result?.draft.filterMatchMode).toBe("ANY");
    expect(result?.draft).toMatchObject({ filenameTemplate: "NHS_{month}_{year}", outputFormat: "CSV", csvDelimiter: "PIPE", csvIncludeHeader: false, xlsxWorksheetName: "" });
    expect(result?.draft.filters[0]).toMatchObject({ sourceHeading: "Description", operator: "CONTAINS", comparisonValue: "Alpha" });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: "profile-1", tenantId: "tenant-1" });
    expect(findFirst.mock.calls[0]?.[0].select.sourceWorksheet.select).toEqual({ id: true, name: true, headers: true, sampleRows: true });
  });

  it("rejects cross-tenant or manufactured source references before any profile write", async () => {
    const create = vi.fn();
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue(null) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    await expect(saveOutputProfileForTenant(db, actor, profileInput())).rejects.toBeInstanceOf(OutputProfileNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });

  it("scopes source lookups to the authenticated tenant and workbook", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { sourceWorksheet: { findFirst }, outputProfile: { create: vi.fn() } } as unknown as PrismaClient;

    await expect(saveOutputProfileForTenant(db, actor, profileInput())).rejects.toBeInstanceOf(OutputProfileNotFoundError);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "worksheet-1",
      sourceWorkbookImportId: "source-1",
      sourceWorkbookImport: { tenantId: "tenant-1" }
    } }));
  });

  it("rejects altered source headings and invalid output headings server-side", () => {
    expect(() => validateOutputProfileInput(profileInput({
      columns: [sourceColumn(0, "Another tenant's field", "MATERIAL")]
    }), ["Product Code", "Description"])).toThrow(OutputProfileValidationError);
    expect(() => validateOutputProfileInput(profileInput({
      columns: [sourceColumn(0, "Product Code", "   ")]
    }), ["Product Code", "Description"])).toThrow("Output heading is required.");
    expect(() => validateOutputProfileInput(profileInput({
      filters: [{ sourceColumnIndex: 99, sourceHeading: "Invented", operator: "EQUALS", comparisonValue: "Yes" }]
    }), ["Product Code", "Description"])).toThrow("A filter refers to a source column that does not exist.");
  });
});
