import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { visibleRows } from "../components/data-mapper/workbook-importer";
import {
  groupValidationIssuesByRow,
  issueMatchesPreviewFilters,
  rowSeverityLabel,
  sourceCellValidationState,
  validationIssuesForWorksheet
} from "../lib/data-mapper/validation-preview";
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
    expect(source).toContain("Worksheet preview");
    expect(source).toContain("Severity");
    expect(source).toContain("Issue type");
    expect(source).toContain("Current value");
    expect(source).toContain("Rule / message");
    expect(source).not.toContain("<h2>Validation issues</h2>");
    expect(source).not.toContain("Source column</th>");
    expect(source).not.toContain("<span>Worksheet</span>");
  });
});
