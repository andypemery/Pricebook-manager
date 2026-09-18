import { describe, expect, it } from "vitest";
import {
  applyReusableProfileToSource,
  manuallyResolveProfileField,
  normaliseSourceHeading
} from "../lib/data-mapper/output-profiles/compatibility";
import { buildOutputPreview } from "../lib/data-mapper/output-profiles/rules";
import type { OutputProfileDraft, SourceWorksheetPreview } from "../lib/data-mapper/output-profiles/types";

function reusableProfile(): OutputProfileDraft {
  return {
    id: "profile-a",
    name: "NHS Contract",
    filenameTemplate: "NHS_{month}_{year}",
    outputFormat: "XLSX",
    csvDelimiter: "PIPE",
    csvIncludeHeader: false,
    xlsxWorksheetName: "NHS prices",
    sourceWorkbookImportId: "source-old",
    sourceWorksheetId: "worksheet-old",
    columns: [
      { clientId: "sku", columnType: "SOURCE", sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "MATERIAL", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null },
      { clientId: "description", columnType: "SOURCE", sourceColumnIndex: 1, sourceHeading: "Description", outputHeading: "DESCRIPTION", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null },
      { clientId: "price", columnType: "SOURCE", sourceColumnIndex: 2, sourceHeading: "Sell price", outputHeading: "NET PRICE", staticValue: "", adjustmentType: "PERCENT_DECREASE", adjustmentValue: "10", roundingDecimalPlaces: 2 },
      { clientId: "currency", columnType: "STATIC", sourceColumnIndex: null, sourceHeading: null, outputHeading: "CURRENCY", staticValue: "GBP", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null }
    ],
    filterMatchMode: "ANY",
    filters: [{ clientId: "eligible", sourceColumnIndex: 3, sourceHeading: "Eligible", operator: "EQUALS", comparisonValue: "Yes" }]
  };
}

function source(headers: string[], sampleRows: string[][] = []): SourceWorksheetPreview {
  return {
    id: "worksheet-new",
    projectId: "project-new",
    sourceWorkbookImportId: "source-new",
    workbookFileName: "September Supplier Pricebook.xlsx",
    worksheetName: "Canon Print",
    headers,
    sampleRows
  };
}

function apply(currentSource: SourceWorksheetPreview) {
  return applyReusableProfileToSource({
    profile: reusableProfile(),
    currentSource,
    originWorkbookFileName: "August Supplier Pricebook.xlsx",
    originWorksheetName: "Products"
  });
}

describe("reusable Output Profile heading compatibility", () => {
  it("rebinds reordered source columns by canonical heading and builds the correct preview", () => {
    const current = source(
      ["Description", "Unused 1", "Unused 2", "Unused 3", "Sell price", "Unused 4", "Eligible", "SKU"],
      [["Printer", "", "", "", "100.00", "", "Yes", "ABC-1"]]
    );
    const result = apply(current);

    expect(result.draft.columns.map((column) => column.sourceColumnIndex)).toEqual([7, 0, 4, null]);
    expect(result.draft.filters[0].sourceColumnIndex).toBe(6);
    expect(result.application).toMatchObject({ requiredFieldCount: 4, matchedFieldCount: 4 });
    expect(buildOutputPreview(result.draft.columns, current.sampleRows, result.draft.filters, result.draft.filterMatchMode).outputRows)
      .toEqual([["ABC-1", "Printer", "90.00", "GBP"]]);
  });

  it.each([
    ["identical headings", ["SKU", "Description", "Sell price", "Eligible"]],
    ["case and whitespace-normalised headings", [" sku ", "DESCRIPTION", "Sell   Price", " eligible"]],
    ["additional unrelated headings", ["Other", "SKU", "Description", "Sell price", "Eligible", "More"]]
  ])("matches %s without fuzzy semantics", (_label, headers) => {
    const result = apply(source(headers));
    expect(result.application.matchedFieldCount).toBe(4);
    expect(result.application.fields.every((field) => field.status === "MATCHED")).toBe(true);
  });

  it("does not fuzzy-match a commercially similar but different heading", () => {
    const result = apply(source(["SKU", "Description", "Sale Value", "Eligible"]));
    const price = result.application.fields.find((field) => field.expectedHeading === "Sell price");
    expect(price).toMatchObject({ status: "MISSING", sourceColumnIndex: null });
    expect(result.draft.columns.find((column) => column.clientId === "price")?.sourceColumnIndex).toBeNull();
  });

  it("reports one or multiple missing fields and includes filter-only references", () => {
    const oneMissing = apply(source(["SKU", "Description", "Sell price"]));
    expect(oneMissing.application.fields.filter((field) => field.status === "MISSING").map((field) => field.expectedHeading)).toEqual(["Eligible"]);

    const multipleMissing = apply(source(["Description"]));
    expect(multipleMissing.application.fields.filter((field) => field.status === "MISSING").map((field) => field.expectedHeading))
      .toEqual(["SKU", "Sell price", "Eligible"]);
  });

  it("requires an explicit choice for duplicate normalised headings", () => {
    const result = apply(source(["SKU", " sku ", "Description", "Sell price", "Eligible"]));
    expect(result.application.fields.find((field) => field.expectedHeading === "SKU")).toMatchObject({
      status: "AMBIGUOUS",
      sourceColumnIndex: null,
      candidateSourceColumnIndexes: [0, 1]
    });
  });

  it("does not require a source match for static output fields", () => {
    const result = apply(source(["SKU", "Description", "Sell price", "Eligible"]));
    expect(result.application.requiredFieldCount).toBe(4);
    expect(result.application.fields.flatMap((field) => field.outputColumnClientIds)).not.toContain("currency");
  });

  it("supports an explicit manual match and rejects an invented current-source index", () => {
    const current = source(["SKU", "Description", "Sale Value", "Eligible"], [["ABC", "Printer", "100", "Yes"]]);
    const initial = apply(current);
    const resolved = manuallyResolveProfileField({
      draft: initial.draft,
      application: initial.application,
      fieldKey: normaliseSourceHeading("Sell price"),
      sourceColumnIndex: 2,
      currentHeaders: current.headers
    });

    expect(resolved.application.matchedFieldCount).toBe(4);
    expect(resolved.draft.columns.find((column) => column.clientId === "price")).toMatchObject({ sourceColumnIndex: 2, sourceHeading: "Sale Value" });
    expect(() => manuallyResolveProfileField({
      draft: initial.draft,
      application: initial.application,
      fieldKey: normaliseSourceHeading("Sell price"),
      sourceColumnIndex: 99,
      currentHeaders: current.headers
    })).toThrow("does not exist");
  });

  it("reuses every saved setting without mutating the persisted master definition", () => {
    const profile = reusableProfile();
    const before = JSON.stringify(profile);
    const current = source(["Description", "Sell price", "Eligible", "SKU", "Extra"]);
    const result = applyReusableProfileToSource({
      profile,
      currentSource: current,
      originWorkbookFileName: "August.xlsx",
      originWorksheetName: "Products"
    });

    expect(result.draft).toMatchObject({
      id: null,
      name: profile.name,
      filenameTemplate: profile.filenameTemplate,
      outputFormat: "XLSX",
      csvDelimiter: "PIPE",
      csvIncludeHeader: false,
      xlsxWorksheetName: "NHS prices",
      filterMatchMode: "ANY"
    });
    expect(result.draft.columns.map(({ outputHeading, adjustmentType, adjustmentValue, roundingDecimalPlaces, staticValue }) => ({ outputHeading, adjustmentType, adjustmentValue, roundingDecimalPlaces, staticValue })))
      .toEqual(profile.columns.map(({ outputHeading, adjustmentType, adjustmentValue, roundingDecimalPlaces, staticValue }) => ({ outputHeading, adjustmentType, adjustmentValue, roundingDecimalPlaces, staticValue })));
    expect(result.draft.filters.map(({ operator, comparisonValue }) => ({ operator, comparisonValue })))
      .toEqual(profile.filters.map(({ operator, comparisonValue }) => ({ operator, comparisonValue })));
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("retains duplicated source-backed columns when a saved profile is applied again", () => {
    const profile = reusableProfile();
    profile.columns.splice(3, 0, {
      clientId: "sale-price",
      columnType: "SOURCE",
      sourceColumnIndex: 2,
      sourceHeading: "Sell price",
      outputHeading: "Sale Price",
      staticValue: "",
      adjustmentType: "MULTIPLY",
      adjustmentValue: "1.25",
      roundingDecimalPlaces: 2
    });
    const result = applyReusableProfileToSource({
      profile,
      currentSource: source(["SKU", "Description", "Sell price", "Eligible"], [["A", "Printer", "100.00", "Yes"]]),
      originWorkbookFileName: "August.xlsx",
      originWorksheetName: "Products"
    });
    const priceColumns = result.draft.columns.filter((column) => column.sourceHeading === "Sell price");

    expect(priceColumns).toHaveLength(2);
    expect(priceColumns.map((column) => column.sourceColumnIndex)).toEqual([2, 2]);
    expect(priceColumns[1]).toMatchObject({ outputHeading: "Sale Price", adjustmentType: "MULTIPLY", adjustmentValue: "1.25", roundingDecimalPlaces: 2 });
  });
});
