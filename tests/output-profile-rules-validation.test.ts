import { describe, expect, it } from "vitest";
import { OutputProfileValidationError, validateOutputProfileInput } from "../lib/data-mapper/output-profiles/validation";
import type { SaveOutputProfileInput } from "../lib/data-mapper/output-profiles/types";

function sourceColumn(overrides: Record<string, unknown> = {}) {
  return {
    columnType: "SOURCE" as const,
    sourceColumnIndex: 1,
    sourceHeading: "List Price",
    outputHeading: "PRICE",
    staticValue: "",
    adjustmentType: "MULTIPLY" as const,
    adjustmentValue: ".8200",
    roundingDecimalPlaces: 2 as const,
    ...overrides
  };
}

function input(overrides: Partial<SaveOutputProfileInput> = {}): SaveOutputProfileInput {
  return {
    name: "NHS Contract",
    filenameTemplate: "{profile}_{date}",
    outputFormat: "CSV",
    csvDelimiter: "COMMA",
    csvIncludeHeader: true,
    xlsxWorksheetName: "",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [sourceColumn()],
    filterMatchMode: "ALL",
    filters: [],
    ...overrides
  };
}

describe("Output Profile rule validation", () => {
  it("normalises valid transformation, rounding and filter configuration", () => {
    const result = validateOutputProfileInput(input({ filters: [{
      sourceColumnIndex: 2,
      sourceHeading: "NHS Eligible",
      operator: "EQUALS",
      comparisonValue: "Yes"
    }] }), ["Product Code", "List Price", "NHS Eligible"]);

    expect(result.columns[0]).toMatchObject({ adjustmentType: "MULTIPLY", adjustmentValue: "0.82", roundingDecimalPlaces: 2 });
    expect(result.filters[0]).toEqual({ sourceColumnIndex: 2, sourceHeading: "NHS Eligible", operator: "EQUALS", comparisonValue: "Yes" });
  });

  it("rejects non-numeric adjustments and divide-by-zero", () => {
    expect(() => validateOutputProfileInput(input({ columns: [sourceColumn({ adjustmentValue: "not a number" })] }), ["Product Code", "List Price"])).toThrow("Adjustment value must be a valid finite number.");
    expect(() => validateOutputProfileInput(input({ columns: [sourceColumn({ adjustmentType: "DIVIDE", adjustmentValue: "0" })] }), ["Product Code", "List Price"])).toThrow("Divide by zero is not allowed.");
  });

  it("rejects malformed and conflicting static-column configuration", () => {
    expect(() => validateOutputProfileInput(input({ columns: [{
      columnType: "STATIC",
      sourceColumnIndex: 0,
      sourceHeading: "Product Code",
      outputHeading: "CURRENCY",
      staticValue: "GBP",
      adjustmentType: "NONE",
      adjustmentValue: "",
      roundingDecimalPlaces: null
    }] }), ["Product Code", "List Price"])).toThrow(OutputProfileValidationError);
  });

  it("rejects invalid rounding and negative business percentages", () => {
    expect(() => validateOutputProfileInput(input({ columns: [sourceColumn({ roundingDecimalPlaces: 5 })] }), ["Product Code", "List Price"])).toThrow("Rounding must be between 0 and 4 decimal places.");
    expect(() => validateOutputProfileInput(input({ columns: [sourceColumn({ adjustmentType: "PERCENT_DECREASE", adjustmentValue: "-18" })] }), ["Product Code", "List Price"])).toThrow("Percentage adjustments cannot be negative.");
  });

  it("rejects manufactured or cross-tenant-style filter source references", () => {
    expect(() => validateOutputProfileInput(input({ filters: [{
      sourceColumnIndex: 2,
      sourceHeading: "Another tenant's heading",
      operator: "EQUALS",
      comparisonValue: "Yes"
    }] }), ["Product Code", "List Price", "NHS Eligible"])).toThrow("A filter source heading does not match the validated worksheet metadata.");
  });

  it("rejects malformed numeric filters and comparison values on blank operators", () => {
    expect(() => validateOutputProfileInput(input({ filters: [{
      sourceColumnIndex: 1,
      sourceHeading: "List Price",
      operator: "GREATER_THAN",
      comparisonValue: "expensive"
    }] }), ["Product Code", "List Price"])).toThrow("A numeric filter comparison must be a valid finite number.");
    expect(() => validateOutputProfileInput(input({ filters: [{
      sourceColumnIndex: 0,
      sourceHeading: "Product Code",
      operator: "IS_BLANK",
      comparisonValue: "unexpected"
    }] }), ["Product Code", "List Price"])).toThrow("Blank filters cannot contain a comparison value.");
  });
});
