import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { visibleRows } from "../components/data-mapper/workbook-importer";
import {
  groupValidationIssuesByRow,
  issueMatchesPreviewFilters,
  rowSeverityLabel,
  sourceCellValidationState,
  updateVisibleRowSelection,
  validationRowsForFilters,
  visibleRowSelectionState,
  validationIssuesForWorksheet
} from "../lib/data-mapper/validation-preview";
import { sourceRowKey } from "../lib/data-mapper/source-row-exclusions";
import type { ValidationIssue, WorksheetPreview } from "../lib/data-mapper/types";

const issues: ValidationIssue[] = [
  { id: "1", fingerprint: "error-price", severity: "Error", category: "price", worksheetName: "Products", rowNumber: 4, sku: "A", field: "Price", currentValue: "", message: "Price cannot be blank." },
  { id: "2", fingerprint: "warning-margin", severity: "Warning", category: "margin", worksheetName: "Products", rowNumber: 4, sku: "A", field: "Margin", currentValue: "15.2", message: "Margin is below 20%." },
  { id: "3", fingerprint: "ignored-sku", severity: "Error", category: "duplicate-sku", worksheetName: "Products", rowNumber: 5, sku: "B", field: "SKU", currentValue: "B", message: "Duplicate SKU." },
  { id: "4", fingerprint: "other", severity: "Error", category: "price", worksheetName: "Other", rowNumber: 4, sku: "A", field: "Price", currentValue: "", message: "Other sheet." }
];

describe("consolidated worksheet validation preview", () => {
  it("groups several issues under one physical row and retains worksheet-tab isolation", () => {
    const worksheetIssues = validationIssuesForWorksheet(issues, "Products", new Set(["ignored-sku"]));
    const grouped = groupValidationIssuesByRow(worksheetIssues);
    expect([...grouped.keys()]).toEqual([4, 5]);
    expect(grouped.get(4)).toHaveLength(2);
    expect(grouped.get(5)?.[0].ignored).toBe(true);
  });

  it("applies severity and issue-type filters to issue details with error precedence", () => {
    const worksheetIssues = validationIssuesForWorksheet(issues, "Products", new Set(["ignored-sku"]));
    expect(worksheetIssues.filter((issue) => issueMatchesPreviewFilters(issue, { severity: "Warning", category: "All" }))).toHaveLength(1);
    expect(worksheetIssues.filter((issue) => issueMatchesPreviewFilters(issue, { severity: "All", category: "price" }))).toHaveLength(1);
    expect(rowSeverityLabel(worksheetIssues.filter((issue) => issue.rowNumber === 4))).toBe("Error · 2 issues");
    expect(rowSeverityLabel(worksheetIssues.filter((issue) => issue.rowNumber === 5))).toBe("Ignored error");
  });

  it("marks only the affected source cell using unresolved, ignored and warning precedence", () => {
    const worksheetIssues = validationIssuesForWorksheet(issues, "Products", new Set(["ignored-sku"]));
    expect(sourceCellValidationState(worksheetIssues, "Price")).toBe("error");
    expect(sourceCellValidationState(worksheetIssues, "SKU")).toBe("ignored-error");
    expect(sourceCellValidationState(worksheetIssues, "Margin")).toBe("warning");
    expect(sourceCellValidationState([{ ...worksheetIssues[0], field: "Item description" }], "Description")).toBe("error");
    expect(sourceCellValidationState(worksheetIssues, "Description")).toBe("normal");
  });

  it("preserves physical header offsets, search and source-column sorting", () => {
    const preview: WorksheetPreview = { worksheetName: "Products", headers: ["SKU", "Price"], rows: [["B", "2"], ["A", "10"]], headerRowNumber: 3, sourceRowCount: 2, previewRowLimit: 100 };
    expect(visibleRows(preview, "A", null)).toEqual([{ cells: ["A", "10"], physicalRowNumber: 5 }]);
    expect(visibleRows(preview, "", { columnIndex: 1, direction: "asc" }).map((row) => row.cells[0])).toEqual(["B", "A"]);
  });

  it("keeps filters and synthetic metadata in Worksheet Preview and removes the separate issue card", () => {
    const source = readFileSync(new URL("../components/data-mapper/workbook-importer.tsx", import.meta.url), "utf8");
    expect(source).toContain("Validation preview");
    expect(source).toContain("Severity");
    expect(source).toContain("Issue type");
    expect(source).toContain("Current value");
    expect(source).toContain("Rule / message");
    expect(source).not.toContain("<h2>Validation issues</h2>");
    expect(source).not.toContain("Source column</th>");
    expect(source).toContain("<span>Worksheet</span>");
  });

  it("shows every duplicate occurrence while retaining one physical row for multiple issues", () => {
    const duplicateIssues: ValidationIssue[] = [
      { id: "d1", fingerprint: "duplicate-row-2", severity: "Error", category: "duplicate-sku", worksheetName: "Products", rowNumber: 2, sku: "ABC", field: "SKU", currentValue: "ABC", message: "SKU ABC is duplicated on rows 2 and 5." },
      { id: "p1", fingerprint: "price-row-2", severity: "Error", category: "price", worksheetName: "Products", rowNumber: 2, sku: "ABC", field: "Sell price", currentValue: "0", message: "Sell price cannot be zero." },
      { id: "d2", fingerprint: "duplicate-row-5", severity: "Error", category: "duplicate-sku", worksheetName: "Products", rowNumber: 5, sku: "ABC", field: "SKU", currentValue: "ABC", message: "SKU ABC is duplicated on rows 2 and 5." }
    ];
    const worksheetIssues = validationIssuesForWorksheet(duplicateIssues, "Products", new Set(["duplicate-row-2"]));
    const duplicateMatches = worksheetIssues.filter((issue) => issueMatchesPreviewFilters(issue, { severity: "All", category: "duplicate-sku" }));
    const grouped = groupValidationIssuesByRow(worksheetIssues);

    expect(duplicateMatches.map((issue) => issue.rowNumber)).toEqual([2, 5]);
    expect(duplicateMatches.map((issue) => issue.ignored)).toEqual([true, false]);
    expect([...grouped.keys()]).toEqual([2, 5]);
    expect(grouped.get(2)).toHaveLength(2);
  });

  it("defaults to workbook-wide physical rows and combines worksheet, severity and issue-type filters", () => {
    const allRows = validationRowsForFilters(issues, new Set(["ignored-sku"]), new Set(), { worksheet: "All worksheets", severity: "All", category: "All" });
    expect(allRows.map((row) => [row.worksheetName, row.rowNumber, row.issues.length])).toEqual([
      ["Products", 4, 2],
      ["Products", 5, 1],
      ["Other", 4, 1]
    ]);
    expect(validationRowsForFilters(issues, new Set(), new Set(), { worksheet: "All worksheets", severity: "Warning", category: "margin" })).toHaveLength(1);
    expect(validationRowsForFilters(issues, new Set(), new Set(), { worksheet: "Products", severity: "Error", category: "price" })).toEqual([
      expect.objectContaining({ key: sourceRowKey("Products", 4), worksheetName: "Products", rowNumber: 4 })
    ]);
  });

  it("selects and clears only visible physical rows while reporting checked and indeterminate state", () => {
    const visible = [sourceRowKey("Products", 4), sourceRowKey("Products", 5)];
    const hidden = sourceRowKey("Other", 4);
    const initial = new Set([hidden]);
    const allVisible = updateVisibleRowSelection(initial, visible, true);
    expect([...allVisible]).toEqual([hidden, ...visible]);
    expect(visibleRowSelectionState(allVisible, visible)).toEqual({ checked: true, indeterminate: false, selectedVisibleCount: 2 });
    const partial = updateVisibleRowSelection(allVisible, [visible[0]], false);
    expect(visibleRowSelectionState(partial, visible)).toEqual({ checked: false, indeterminate: true, selectedVisibleCount: 1 });
    const cleared = updateVisibleRowSelection(partial, visible, false);
    expect([...cleared]).toEqual([hidden]);
    expect(visibleRowSelectionState(cleared, visible)).toEqual({ checked: false, indeterminate: false, selectedVisibleCount: 0 });
  });

  it("removes excluded rows from the active issue view without conflating ignored errors", () => {
    const excluded = new Set([sourceRowKey("Products", 4)]);
    const rows = validationRowsForFilters(issues, new Set(["ignored-sku"]), excluded, { worksheet: "All worksheets", severity: "All", category: "All" });
    expect(rows.map((row) => row.key)).toEqual([sourceRowKey("Products", 5), sourceRowKey("Other", 4)]);
    expect(rows[0].issues[0].ignored).toBe(true);
  });
});
