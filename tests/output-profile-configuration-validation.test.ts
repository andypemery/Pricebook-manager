import { describe, expect, it } from "vitest";
import { defaultWorksheetName, effectiveWorksheetName, outputProfileAttentionIssues, validateWorksheetName } from "../lib/data-mapper/output-profiles/configuration";
import { OutputProfileValidationError, validateOutputProfileInput } from "../lib/data-mapper/output-profiles/validation";
import type { OutputProfileDraft, SaveOutputProfileInput } from "../lib/data-mapper/output-profiles/types";

function input(overrides: Partial<SaveOutputProfileInput> = {}): SaveOutputProfileInput {
  return {
    name: "NHS Contract",
    filenameTemplate: "NHS_{month}_{year}",
    outputFormat: "CSV",
    csvDelimiter: "COMMA",
    csvIncludeHeader: true,
    xlsxWorksheetName: "",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [],
    filterMatchMode: "ALL",
    filters: [],
    ...overrides
  };
}

function draft(overrides: Partial<OutputProfileDraft> = {}): OutputProfileDraft {
  return {
    ...input(),
    id: null,
    columns: [],
    filters: [],
    ...overrides
  };
}

describe("Output Profile configuration validation", () => {
  it("persists canonical tokenised CSV settings and strips a duplicate extension", () => {
    const result = validateOutputProfileInput(input({
      filenameTemplate: " NHS_{month}_{year}.csv ",
      csvDelimiter: "PIPE",
      csvIncludeHeader: false
    }), [], "Supplier.xlsx");

    expect(result).toMatchObject({
      filenameTemplate: "NHS_{month}_{year}",
      outputFormat: "CSV",
      csvDelimiter: "PIPE",
      csvIncludeHeader: false,
      xlsxWorksheetName: null
    });
  });

  it("rejects unsupported formats, delimiters and malformed header settings", () => {
    expect(() => validateOutputProfileInput(input({ outputFormat: "XLSM" as "CSV" }), [])).toThrow("Output format is not supported.");
    expect(() => validateOutputProfileInput(input({ csvDelimiter: "SPACE" as "COMMA" }), [])).toThrow("CSV delimiter is not supported.");
    expect(() => validateOutputProfileInput(input({ csvIncludeHeader: "yes" as unknown as boolean }), [])).toThrow("CSV header setting must be yes or no.");
  });

  it("rejects unsupported or malformed filename tokens server-side", () => {
    expect(() => validateOutputProfileInput(input({ filenameTemplate: "NHS_{customer}" }), [])).toThrow("Filename token {customer} is not supported.");
    expect(() => validateOutputProfileInput(input({ filenameTemplate: "NHS_{year" }), [])).toThrow("Output filename template contains a malformed token.");
    expect(() => validateOutputProfileInput(input({ filenameTemplate: null as unknown as string }), [])).toThrow("Output filename template must be text.");
  });

  it("persists valid XLSX settings and validates Excel worksheet constraints", () => {
    expect(validateOutputProfileInput(input({ outputFormat: "XLSX", xlsxWorksheetName: "NHS Pricing" }), []))
      .toMatchObject({ outputFormat: "XLSX", xlsxWorksheetName: "NHS Pricing" });
    expect(() => validateOutputProfileInput(input({ outputFormat: "XLSX", xlsxWorksheetName: "Bad/Name" }), []))
      .toThrow(OutputProfileValidationError);
    expect(validateWorksheetName("'Bad name")).toContain("apostrophe");
    expect(validateWorksheetName("A".repeat(32))).toContain("31 characters");
    expect(defaultWorksheetName("Framework / Education")).toBe("Framework Education");
  });

  it("allows an optional XLSX worksheet name and derives a safe effective tab name", () => {
    expect(validateOutputProfileInput(input({ outputFormat: "XLSX", xlsxWorksheetName: "" }), []))
      .toMatchObject({ outputFormat: "XLSX", xlsxWorksheetName: null });
    expect(validateWorksheetName("")).toBeNull();
    expect(effectiveWorksheetName("Framework / Education", "")).toBe("Framework Education");
    expect(effectiveWorksheetName("Framework / Education", "Custom tab")).toBe("Custom tab");
  });

  it("reports lightweight readiness separately from source-data validity", () => {
    expect(outputProfileAttentionIssues(draft(), "Supplier.xlsx", "2026-09-13"))
      .toContain("Add at least one output column.");
    expect(outputProfileAttentionIssues(draft({ filenameTemplate: "Bad_{token}" }), "Supplier.xlsx", "2026-09-13"))
      .toContain("Filename token {token} is not supported.");
  });
});
