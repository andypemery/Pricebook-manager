import { describe, expect, it } from "vitest";
import { addSourceColumn, addStaticColumn, moveOutputColumn, removeOutputColumn, updateOutputColumn } from "../lib/data-mapper/output-profiles/profile-state";
import { buildOutputPreview, filterSourceRows, sourceRowMatchesFilter, transformNumericValue } from "../lib/data-mapper/output-profiles/rules";
import type { OutputProfileFilterDraft } from "../lib/data-mapper/output-profiles/types";

function filter(overrides: Partial<OutputProfileFilterDraft> = {}): OutputProfileFilterDraft {
  return {
    clientId: "filter-1",
    sourceColumnIndex: 2,
    sourceHeading: "NHS Eligible",
    operator: "EQUALS",
    comparisonValue: "Yes",
    ...overrides
  };
}

describe("shared Output Profile rule engine", () => {
  it("creates, renames, reorders, previews and removes fixed columns", () => {
    const source = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "Product Code" }, "source");
    const withFixed = addStaticColumn(source, "fixed");
    const configured = updateOutputColumn(withFixed, "fixed", { outputHeading: "CURRENCY", staticValue: "GBP" });
    const reordered = moveOutputColumn(configured, "fixed", 0);
    const preview = buildOutputPreview(reordered, [["A"], ["B"], ["C"]], [], "ALL");

    expect(reordered[0]).toMatchObject({ columnType: "STATIC", sourceHeading: null, outputHeading: "CURRENCY", staticValue: "GBP" });
    expect(preview.outputRows).toEqual([["GBP", "A"], ["GBP", "B"], ["GBP", "C"]]);
    expect(removeOutputColumn(reordered, "fixed").map((column) => column.clientId)).toEqual(["source"]);
  });

  it("applies no adjustment without altering the source representation", () => {
    expect(transformNumericValue("100.00", "NONE", "", null)).toBe("100.00");
  });

  it("applies multipliers and rounds deterministically after adjustment", () => {
    expect(["100.00", "250.00", "79.99"].map((value) => transformNumericValue(value, "MULTIPLY", "0.82", 2)))
      .toEqual(["82.00", "205.00", "65.59"]);
    expect(transformNumericValue("1.005", "NONE", "", 2)).toBe("1.01");
    expect(transformNumericValue("0.00432178", "NONE", "", 5)).toBe("0.00432");
    expect(transformNumericValue("0.00432178", "MULTIPLY", "1.1", 6)).toBe("0.004754");
  });

  it("applies percentage increase, percentage decrease and division", () => {
    expect(transformNumericValue("100", "PERCENT_INCREASE", "12.5", 2)).toBe("112.50");
    expect(transformNumericValue("100", "PERCENT_DECREASE", "18", 2)).toBe("82.00");
    expect(transformNumericValue("10", "DIVIDE", "4", 2)).toBe("2.50");
  });

  it("flags only adjusted negative values in the current compact sample", () => {
    const columns = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "Value" }, "source");
    const adjusted = updateOutputColumn(columns, "source", { adjustmentType: "PERCENT_DECREASE", adjustmentValue: "125" });

    expect(buildOutputPreview(adjusted, [["100"], ["50"], ["20"]], [], "ALL").negativeAdjustedSample).toBe(true);
    expect(buildOutputPreview(columns, [["-100"]], [], "ALL").negativeAdjustedSample).toBe(false);
  });

  it("supports text equality, inequality, contains and starts-with filters", () => {
    const row = ["A100", "Network Switch", "Yes"];
    expect(sourceRowMatchesFilter(row, filter())).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ operator: "NOT_EQUALS", comparisonValue: "No" }))).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 1, sourceHeading: "Description", operator: "CONTAINS", comparisonValue: "switch" }))).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 1, sourceHeading: "Description", operator: "NOT_CONTAINS", comparisonValue: "cable" }))).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 0, sourceHeading: "Product Code", operator: "STARTS_WITH", comparisonValue: "a1" }))).toBe(true);
  });

  it("supports blank, nonblank and exact decimal numeric comparisons", () => {
    const row = ["A100", "", "Yes", "100.10"];
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 1, sourceHeading: "Notes", operator: "IS_BLANK", comparisonValue: "" }))).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 0, sourceHeading: "Product Code", operator: "IS_NOT_BLANK", comparisonValue: "" }))).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 3, sourceHeading: "Price", operator: "GREATER_THAN", comparisonValue: "100.09" }))).toBe(true);
    expect(sourceRowMatchesFilter(row, filter({ sourceColumnIndex: 3, sourceHeading: "Price", operator: "LESS_THAN_OR_EQUAL", comparisonValue: "100.10" }))).toBe(true);
  });

  it("applies understandable ALL and ANY behaviour", () => {
    const rows = [["A", "Hardware", "Yes"], ["B", "Software", "Yes"], ["C", "Hardware", "No"]];
    const rules = [
      filter({ sourceColumnIndex: 2, sourceHeading: "NHS Eligible", comparisonValue: "Yes" }),
      filter({ clientId: "filter-2", sourceColumnIndex: 1, sourceHeading: "Category", comparisonValue: "Hardware" })
    ];

    expect(filterSourceRows(rows, rules, "ALL")).toEqual([["A", "Hardware", "Yes"]]);
    expect(filterSourceRows(rows, rules, "ANY")).toEqual([["A", "Hardware", "Yes"], ["B", "Software", "Yes"], ["C", "Hardware", "No"]]);
  });

  it("filters on a source column that is absent from the output and reports zero sample matches", () => {
    const columns = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "Product Code" }, "source");
    const preview = buildOutputPreview(columns, [["A", "No"], ["B", "No"], ["C", "No"]], [
      filter({ sourceColumnIndex: 1, sourceHeading: "NHS Eligible", comparisonValue: "Yes" })
    ], "ALL");

    expect(columns.some((column) => column.sourceColumnIndex === 1)).toBe(false);
    expect(preview.matchingSourceRows).toEqual([]);
    expect(preview.outputRows).toEqual([]);
  });
});
