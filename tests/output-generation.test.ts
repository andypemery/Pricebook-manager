import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/data-mapper/validation-overrides", () => ({
  loadSourceValidationState: vi.fn(),
  SourceWorkbookUnavailableError: class SourceWorkbookUnavailableError extends Error {}
}));

import { generateOutputForTenant, OutputGenerationError } from "../lib/data-mapper/output-profiles/generation";
import { loadSourceValidationState } from "../lib/data-mapper/validation-overrides";

const headers = ["SKU", "Price", "Eligible"];
const baseInput = {
  name: "Pricebook",
  filenameTemplate: "{profile}_{date}",
  outputFormat: "CSV" as const,
  csvDelimiter: "SEMICOLON" as const,
  csvIncludeHeader: true,
  xlsxWorksheetName: "",
  sourceWorkbookImportId: "source-1",
  sourceWorksheetId: "worksheet-1",
  columns: [
    { columnType: "SOURCE" as const, sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE" as const, adjustmentValue: "", roundingDecimalPlaces: null },
    { columnType: "SOURCE" as const, sourceColumnIndex: 1, sourceHeading: "Price", outputHeading: "NET", staticValue: "", adjustmentType: "MULTIPLY" as const, adjustmentValue: "1.1", roundingDecimalPlaces: 6 as const }
  ],
  filterMatchMode: "ALL" as const,
  filters: [{ sourceColumnIndex: 2, sourceHeading: "Eligible", operator: "EQUALS" as const, comparisonValue: "Yes" }]
};

async function workbook() {
  const value = new ExcelJS.Workbook();
  const sheet = value.addWorksheet("Products");
  sheet.addRows([headers, ["A;1", "0.00432178", "Yes"], ["B", "10", "No"]]);
  return value;
}

describe("direct output generation", () => {
  beforeEach(async () => {
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook: await workbook(), unresolvedBlockingCount: 0, ignoredBlockingCount: 2 } as never);
  });

  it("creates real escaped CSV from the full worksheet using the shared decimal rules", async () => {
    const db = { sourceWorksheet: { findFirst: vi.fn(async () => ({ id: "worksheet-1", name: "Products", detectedHeaderRow: 1, headers, sourceWorkbookImport: { id: "source-1", originalFileName: "input.xlsx" } })) } } as never;
    const output = await generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16");
    expect(output.fileName).toBe("Pricebook_2026-09-16.csv");
    expect(new TextDecoder().decode(output.bytes)).toBe('SKU;NET\r\n"A;1";0.004754');
    expect(output.rowCount).toBe(1);
    expect(output.ignoredBlockingCount).toBe(2);
  });

  it("creates a parseable XLSX with headings and generated rows", async () => {
    const db = { sourceWorksheet: { findFirst: vi.fn(async () => ({ id: "worksheet-1", name: "Products", detectedHeaderRow: 1, headers, sourceWorkbookImport: { id: "source-1", originalFileName: "input.xlsx" } })) } } as never;
    const output = await generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, { ...baseInput, outputFormat: "XLSX", xlsxWorksheetName: "Generated" }, "2026-09-16");
    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(output.bytes.buffer.slice(output.bytes.byteOffset, output.bytes.byteOffset + output.bytes.byteLength));
    expect(output.fileName).toBe("Pricebook_2026-09-16.xlsx");
    expect(parsed.getWorksheet("Generated")?.getRow(1).values).toContain("NET");
    expect(parsed.getWorksheet("Generated")?.getCell("B2").text).toBe("0.004754");
  });

  it("blocks unresolved errors and zero matching full-source filters", async () => {
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook: await workbook(), unresolvedBlockingCount: 1, ignoredBlockingCount: 0 } as never);
    const db = { sourceWorksheet: { findFirst: vi.fn(async () => ({ id: "worksheet-1", name: "Products", detectedHeaderRow: 1, headers, sourceWorkbookImport: { id: "source-1", originalFileName: "input.xlsx" } })) } } as never;
    await expect(generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, baseInput, "2026-09-16")).rejects.toBeInstanceOf(OutputGenerationError);
    vi.mocked(loadSourceValidationState).mockResolvedValue({ workbook: await workbook(), unresolvedBlockingCount: 0, ignoredBlockingCount: 0 } as never);
    await expect(generateOutputForTenant(db, { id: "user-1", tenantId: "tenant-1" }, { ...baseInput, filters: [{ ...baseInput.filters[0], comparisonValue: "No match" }] }, "2026-09-16")).rejects.toThrow("No source rows matched");
  });
});
