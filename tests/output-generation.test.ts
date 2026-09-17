import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/data-mapper/validation-overrides", () => ({
  loadSourceValidationState: vi.fn(),
  SourceWorkbookUnavailableError: class SourceWorkbookUnavailableError extends Error {}
}));

import { generateOutputForTenant, OutputGenerationError } from "../lib/data-mapper/output-profiles/generation";
import { loadSourceValidationState } from "../lib/data-mapper/validation-overrides";

const headers = ["SKU", "Price", "Eligible"];
const worksheets = [
  { id: "worksheet-1", name: "HP Print", position: 0, detectedHeaderRow: 1, headers },
  { id: "worksheet-2", name: "Canon Print", position: 1, detectedHeaderRow: 1, headers }
];
const baseInput = {
  name: "Pricebook",
  filenameTemplate: "NHS_{month}_{year}",
  outputFormat: "CSV" as const,
  csvDelimiter: "SEMICOLON" as const,
  csvIncludeHeader: true,
  xlsxWorksheetName: "",
  worksheetMode: "COMBINE" as const,
  worksheetNameMode: "SOURCE" as const,
  worksheetNameMappings: {},
  selectedWorksheetIds: ["worksheet-1", "worksheet-2"],
  sourceWorkbookImportId: "source-1",
  sourceWorksheetId: "worksheet-1",
  columns: [
    { columnType: "SOURCE" as const, sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE" as const, adjustmentValue: "", roundingDecimalPlaces: null },
    { columnType: "SOURCE" as const, sourceColumnIndex: 1, sourceHeading: "Price", outputHeading: "NET", staticValue: "", adjustmentType: "MULTIPLY" as const, adjustmentValue: "1.1", roundingDecimalPlaces: 2 as const }
  ],
  filterMatchMode: "ALL" as const,
  filters: [{ sourceColumnIndex: 2, sourceHeading: "Eligible", operator: "EQUALS" as const, comparisonValue: "Yes" }]
};

async function sourceWorkbook() {
  const value = new ExcelJS.Workbook();
  value.addWorksheet("HP Print").addRows([headers, ["HP-1", "10", "Yes"], ["HP-2", "20", "No"]]);
  value.addWorksheet("Canon Print").addRows([headers, ["CANON-1", "5", "Yes"], ["CANON-2", "7", "Yes"]]);
  return value;
}

function database(worksheetMetadata = worksheets) {
  const findFirst = vi.fn(async () => ({ id: "source-1", originalFileName: "input.xlsx", worksheets: worksheetMetadata }));
  return { db: { sourceWorkbookImport: { findFirst } } as never, findFirst };
}

describe("multi-worksheet output generation", () => {
  beforeEach(async () => {
    vi.mocked(loadSourceValidationState).mockReset();
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook: await sourceWorkbook(), issues: [], unresolvedBlockingCount: 0, ignoredBlockingCount: 0 } as never);
  });

  it("combines compatible worksheets in source order, writes headings once and applies rules per sheet", async () => {
    const { db, findFirst } = database();
    const output = await generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16");
    expect(new TextDecoder().decode(output.bytes)).toBe("SKU;NET\r\nHP-1;11.00\r\nCANON-1;5.50\r\nCANON-2;7.70");
    expect(output).toMatchObject({ fileName: "NHS_September_2026.csv", rowCount: 3, worksheetCount: 2, zeroRowWorksheetNames: [] });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(loadSourceValidationState).toHaveBeenCalledTimes(1);
  });

  it("generates CSV and XLSX with original and multiplied columns from the same source field", async () => {
    const duplicatedPriceInput = {
      ...baseInput,
      csvDelimiter: "COMMA" as const,
      selectedWorksheetIds: ["worksheet-1"],
      filters: [],
      columns: [
        { ...baseInput.columns[1], outputHeading: "Cost Price", adjustmentType: "NONE" as const, adjustmentValue: "", roundingDecimalPlaces: null },
        { ...baseInput.columns[1], outputHeading: "Sale Price", adjustmentType: "MULTIPLY" as const, adjustmentValue: "1.25", roundingDecimalPlaces: 2 as const }
      ]
    };
    const csv = await generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, duplicatedPriceInput, "2026-09-16");
    expect(new TextDecoder().decode(csv.bytes)).toBe("Cost Price,Sale Price\r\n10,12.50\r\n20,25.00");

    const xlsx = await generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, { ...duplicatedPriceInput, outputFormat: "XLSX" }, "2026-09-16");
    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(xlsx.bytes);
    expect(parsed.worksheets[0].getRow(1).values).toEqual([undefined, "Cost Price", "Sale Price"]);
    expect(parsed.worksheets[0].getRow(2).values).toEqual([undefined, "10", "12.50"]);
  });

  it("keeps selected worksheets as separately named tabs in one XLSX", async () => {
    const { db } = database();
    const output = await generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, {
      ...baseInput,
      outputFormat: "XLSX",
      worksheetMode: "SEPARATE_WORKSHEETS",
      worksheetNameMode: "CUSTOM",
      worksheetNameMappings: { "hp print": "HP", "canon print": "Canon" }
    }, "2026-09-16");
    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(output.bytes);
    expect(parsed.worksheets.map((sheet) => sheet.name)).toEqual(["HP", "Canon"]);
    expect(parsed.getWorksheet("HP")?.getCell("A2").text).toBe("HP-1");
    expect(parsed.getWorksheet("Canon")?.getCell("A2").text).toBe("CANON-1");
  });

  it("rejects CSV for the separate-tabs mode", async () => {
    const { db } = database();
    await expect(generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, { ...baseInput, worksheetMode: "SEPARATE_WORKSHEETS" }, "2026-09-16"))
      .rejects.toThrow("requires XLSX");
  });

  it("returns one ZIP of per-worksheet CSV files and adds a worksheet suffix when the token is absent", async () => {
    const { db } = database();
    const output = await generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, { ...baseInput, worksheetMode: "SEPARATE_FILES" }, "2026-09-16");
    const files = unzipSync(output.bytes);
    expect(output).toMatchObject({ fileName: "NHS_September_2026.zip", contentType: "application/zip" });
    expect(Object.keys(files)).toEqual(["NHS_September_2026_HP Print.csv", "NHS_September_2026_Canon Print.csv"]);
    expect(new TextDecoder().decode(files["NHS_September_2026_HP Print.csv"])).toContain("HP-1;11.00");
  });

  it("uses {worksheet} for per-sheet XLSX files inside the ZIP", async () => {
    const { db } = database();
    const output = await generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, {
      ...baseInput,
      filenameTemplate: "NHS_{worksheet}_{date}",
      outputFormat: "XLSX",
      worksheetMode: "SEPARATE_FILES"
    }, "2026-09-16");
    const files = unzipSync(output.bytes);
    expect(output.fileName).toBe("NHS_2026-09-16.zip");
    expect(Object.keys(files)).toEqual(["NHS_HP Print_2026-09-16.xlsx", "NHS_Canon Print_2026-09-16.xlsx"]);
    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(files["NHS_HP Print_2026-09-16.xlsx"]);
    expect(parsed.getWorksheet("HP Print")?.getCell("A2").text).toBe("HP-1");
  });

  it("blocks a selected worksheet with a missing or ambiguous required heading", async () => {
    const missing = [{ ...worksheets[0] }, { ...worksheets[1], headers: ["SKU", "Eligible"] }];
    await expect(generateOutputForTenant(database(missing).db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16"))
      .rejects.toThrow("Canon Print: Missing source heading “Price”");
    const ambiguous = [{ ...worksheets[0] }, { ...worksheets[1], headers: ["SKU", "Price", "Price", "Eligible"] }];
    await expect(generateOutputForTenant(database(ambiguous).db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16"))
      .rejects.toThrow("ambiguous");
  });

  it("rejects a selected worksheet ID outside the tenant-owned source workbook", async () => {
    await expect(generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, { ...baseInput, selectedWorksheetIds: ["another-tenant-sheet"] }, "2026-09-16"))
      .rejects.toThrow("do not belong to this source workbook");
  });

  it("allows a partial zero-row result, reports it, and blocks when all selected worksheets match zero rows", async () => {
    const workbook = await sourceWorkbook();
    workbook.getWorksheet("Canon Print")!.getColumn(3).eachCell((cell, rowNumber) => { if (rowNumber > 1) cell.value = "No"; });
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook, issues: [], unresolvedBlockingCount: 0, ignoredBlockingCount: 0 } as never);
    const partial = await generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16");
    expect(partial.zeroRowWorksheetNames).toEqual(["Canon Print"]);
    await expect(generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, { ...baseInput, filters: [{ ...baseInput.filters[0], comparisonValue: "Never" }] }, "2026-09-16"))
      .rejects.toBeInstanceOf(OutputGenerationError);
  });

  it("blocks unresolved selected-sheet errors but permits their revalidated ignored state", async () => {
    const workbook = await sourceWorkbook();
    const issue = { fingerprint: "issue-1", severity: "Error", worksheetName: "HP Print", ignored: false };
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook, issues: [issue] } as never);
    await expect(generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16"))
      .rejects.toThrow("1 blocking error");
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook, issues: [{ ...issue, ignored: true }] } as never);
    await expect(generateOutputForTenant(database().db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16"))
      .resolves.toMatchObject({ ignoredBlockingCount: 1 });
  });
});
