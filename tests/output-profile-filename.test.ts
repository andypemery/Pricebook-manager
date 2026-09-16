import { describe, expect, it } from "vitest";
import { cleanFilenameTemplate, defaultEffectiveDate, resolveOutputFilename, validateFilenameTemplate } from "../lib/data-mapper/output-profiles/filename";

function resolve(overrides: Partial<Parameters<typeof resolveOutputFilename>[0]> = {}) {
  return resolveOutputFilename({
    filenameTemplate: "{profile}_{source}_{date}",
    profileName: "NHS Contract",
    sourceFilename: "Supplier_Master_September.xlsx",
    effectiveDate: "2026-09-13",
    outputFormat: "CSV",
    ...overrides
  });
}

describe("shared Output Profile filename resolver", () => {
  it("derives the default effective date from the current date context", () => {
    expect(defaultEffectiveDate(new Date("2026-09-13T12:00:00.000Z"))).toBe("2026-09-13");
    expect(defaultEffectiveDate(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
  });

  it("resolves every supported date, profile and source token deterministically", () => {
    const result = resolve({
      filenameTemplate: "{day}_{month}_{month_number}_{year}_{year_short}_{date}_{profile}_{source}"
    });

    expect(result.finalFilename).toBe("13_September_09_2026_26_2026-09-13_NHS Contract_Supplier_Master_September.csv");
    expect(result.errors).toEqual([]);
  });

  it("supports mixed and repeated tokens", () => {
    expect(resolve({ filenameTemplate: "Pricing_{year}_{month}_{year}" }).finalFilename)
      .toBe("Pricing_2026_September_2026.csv");
  });

  it("flags unknown and malformed tokens", () => {
    expect(validateFilenameTemplate("Pricing_{customer}_{year}")).toContain("Filename token {customer} is not supported.");
    expect(validateFilenameTemplate("Pricing_{year")).toContain("Output filename template contains a malformed token.");
    expect(validateFilenameTemplate("Pricing_year}")).toContain("Output filename template contains a malformed token.");
  });

  it("uses future and past effective dates without replacing the saved tokens", () => {
    const template = "NHS_Pricing_{month}_{year}";
    const future = resolve({ filenameTemplate: template, effectiveDate: "2026-10-01" });
    const past = resolve({ filenameTemplate: template, effectiveDate: "2026-08-31" });

    expect(future.finalFilename).toBe("NHS_Pricing_October_2026.csv");
    expect(past.finalFilename).toBe("NHS_Pricing_August_2026.csv");
    expect(future.cleanTemplate).toBe(template);
    expect(past.cleanTemplate).toBe(template);
  });

  it("keeps explicit date-only values stable across month and year boundaries", () => {
    expect(resolve({ filenameTemplate: "{date}_{day}_{month}_{year}", effectiveDate: "2026-12-31" }).finalFilename)
      .toBe("2026-12-31_31_December_2026.csv");
    expect(resolve({ filenameTemplate: "{date}_{day}_{month}_{year}", effectiveDate: "2027-01-01" }).finalFilename)
      .toBe("2027-01-01_01_January_2027.csv");
  });

  it("removes a manually supplied known extension and derives the selected extension once", () => {
    expect(cleanFilenameTemplate("NHS_{date}.csv")).toBe("NHS_{date}");
    expect(resolve({ filenameTemplate: "NHS_{date}.csv" }).finalFilename).toBe("NHS_2026-09-13.csv");
    expect(resolve({ filenameTemplate: "NHS_{date}.csv", outputFormat: "XLSX" }).finalFilename).toBe("NHS_2026-09-13.xlsx");
  });

  it("sanitises slashes, backslashes, traversal-like input, controls and unsafe Windows characters", () => {
    const result = resolve({ filenameTemplate: "  ../NHS\\Contract:<test>?\u0000  .csv " });

    expect(result.finalFilename).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/);
    expect(result.finalFilename).not.toContain("..");
    expect(result.finalFilename).toMatch(/\.csv$/);
    expect(result.warnings).toContain("Unsafe filename characters were replaced in the preview.");
  });

  it("trims problematic whitespace while preserving safe human-readable spaces", () => {
    expect(resolve({ filenameTemplate: "  NHS Contract Pricing  " }).finalFilename).toBe("NHS Contract Pricing.csv");
  });

  it("normalises profile/source token values and protects Windows-reserved filenames", () => {
    expect(resolve({ profileName: "NHS/Contract", sourceFilename: "Supplier:Master.xlsx" }).finalFilename)
      .toBe("NHS-Contract_Supplier-Master_2026-09-13.csv");
    expect(resolve({ filenameTemplate: "CON" }).finalFilename).toBe("_CON.csv");
  });
});
