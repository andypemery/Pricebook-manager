import { describe, expect, it } from "vitest";
import { outputProfileDraftFingerprint, saveInputFromOutputProfileDraft } from "../lib/data-mapper/output-profiles/draft-state";
import { resolveOutputFilename } from "../lib/data-mapper/output-profiles/filename";
import { buildOutputPreview } from "../lib/data-mapper/output-profiles/rules";
import { validateOutputProfileInput } from "../lib/data-mapper/output-profiles/validation";
import type { OutputProfileDraft } from "../lib/data-mapper/output-profiles/types";

function configuredProfile(): OutputProfileDraft {
  return {
    id: "profile-1",
    name: "NHS Contract",
    filenameTemplate: "NHS_Pricing_{month}_{year}",
    outputFormat: "CSV",
    csvDelimiter: "PIPE",
    csvIncludeHeader: true,
    xlsxWorksheetName: "",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [{
      clientId: "price",
      columnType: "SOURCE",
      sourceColumnIndex: 1,
      sourceHeading: "List Price",
      outputHeading: "PRICE",
      staticValue: "",
      adjustmentType: "PERCENT_DECREASE",
      adjustmentValue: "18",
      roundingDecimalPlaces: 2
    }, {
      clientId: "currency",
      columnType: "STATIC",
      sourceColumnIndex: null,
      sourceHeading: null,
      outputHeading: "CURRENCY",
      staticValue: "GBP",
      adjustmentType: "NONE",
      adjustmentValue: "",
      roundingDecimalPlaces: null
    }],
    filterMatchMode: "ALL",
    filters: [{
      clientId: "eligible",
      sourceColumnIndex: 2,
      sourceHeading: "NHS Eligible",
      operator: "EQUALS",
      comparisonValue: "Yes"
    }]
  };
}

describe("integrated Output Profile workflow", () => {
  it("keeps mapped, static, transformed, filtered and filename configuration coherent", () => {
    const profile = configuredProfile();
    const preview = buildOutputPreview(profile.columns, [
      ["A", "100.00", "Yes"],
      ["B", "250.00", "No"],
      ["C", "79.99", "Yes"]
    ], profile.filters, profile.filterMatchMode);
    const persisted = validateOutputProfileInput(
      saveInputFromOutputProfileDraft(profile),
      ["Product Code", "List Price", "NHS Eligible"],
      "Supplier_Master.xlsx"
    );

    expect(preview.outputRows).toEqual([["82.00", "GBP"], ["65.59", "GBP"]]);
    expect(persisted).toMatchObject({
      name: "NHS Contract",
      filenameTemplate: "NHS_Pricing_{month}_{year}",
      outputFormat: "CSV",
      csvDelimiter: "PIPE",
      columns: [expect.objectContaining({ outputHeading: "PRICE", adjustmentType: "PERCENT_DECREASE" }), expect.objectContaining({ staticValue: "GBP" })],
      filters: [expect.objectContaining({ sourceHeading: "NHS Eligible", comparisonValue: "Yes" })]
    });
  });

  it("keeps one-off date overrides outside the saved definition", () => {
    const profile = configuredProfile();
    const baseline = outputProfileDraftFingerprint(profile);
    const september = resolveOutputFilename({ filenameTemplate: profile.filenameTemplate, profileName: profile.name, sourceFilename: "Supplier_Master.xlsx", effectiveDate: "2026-09-13", outputFormat: profile.outputFormat });
    const october = resolveOutputFilename({ filenameTemplate: profile.filenameTemplate, profileName: profile.name, sourceFilename: "Supplier_Master.xlsx", effectiveDate: "2026-10-01", outputFormat: profile.outputFormat });

    expect(september.finalFilename).toBe("NHS_Pricing_September_2026.csv");
    expect(october.finalFilename).toBe("NHS_Pricing_October_2026.csv");
    expect(outputProfileDraftFingerprint(profile)).toBe(baseline);
    expect(saveInputFromOutputProfileDraft(profile)).not.toHaveProperty("effectiveDate");
  });
});
