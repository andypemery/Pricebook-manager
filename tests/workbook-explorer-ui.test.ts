import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CompactWorkbookSummary,
  SelectedWorksheetSummary,
  WorksheetTabs,
  countWorksheetIssues,
  nextWorksheetTabIndex,
  worksheetPreviewRowDescription
} from "../components/data-mapper/workbook-explorer-ui";
import type { WorksheetSummary } from "../lib/data-mapper/types";

function worksheet(name: string, rowCount = 2_501, columnCount = 12): WorksheetSummary {
  return {
    name,
    rowCount,
    columnCount,
    detectedHeaderRow: 1,
    headers: ["SKU", "Product"],
    importStatus: "Ready",
    message: null
  };
}

describe("Workbook Explorer UI", () => {
  it("renders a compact workbook summary with a full filename tooltip", () => {
    const fileName = "Axiom_Data_Mapper_Demo_Pricebook_20000_Rows_exceljs.xlsx";
    const markup = renderToStaticMarkup(createElement(CompactWorkbookSummary, {
      fileName,
      fileSize: "1.1 MB",
      worksheetCount: 9,
      totalRows: 20_012,
      totalColumns: 97
    }));

    expect(markup).toContain(`title="${fileName}"`);
    expect(markup).toContain("9 worksheets");
    expect(markup).toContain("20,012 rows");
    expect(markup).toContain("97 columns");
    expect(markup).not.toContain("summaryGrid");
  });

  it("renders nine or more worksheet tabs without losing the selected state or full names", () => {
    const worksheets = Array.from({ length: 10 }, (_, index) => worksheet(
      index === 8 ? "Regional Enterprise Pricebook 9" : `Pricebook ${index + 1}`
    ));
    const markup = renderToStaticMarkup(createElement(WorksheetTabs, {
      worksheets,
      selectedWorksheetName: "Pricebook 4",
      issueCountsByWorksheet: new Map(),
      onSelectWorksheet: vi.fn()
    }));

    expect(markup.match(/role="tab"/g)).toHaveLength(10);
    expect(markup).toContain("role=\"tablist\"");
    expect(markup).toContain("aria-selected=\"true\"");
    expect(markup).toContain('title="Regional Enterprise Pricebook 9 — No validation issues"');
  });

  it("supports standard arrow, Home and End worksheet-tab navigation", () => {
    expect(nextWorksheetTabIndex(3, "ArrowRight", 10)).toBe(4);
    expect(nextWorksheetTabIndex(0, "ArrowLeft", 10)).toBe(9);
    expect(nextWorksheetTabIndex(5, "Home", 10)).toBe(0);
    expect(nextWorksheetTabIndex(5, "End", 10)).toBe(9);
    expect(nextWorksheetTabIndex(5, "Enter", 10)).toBeNull();
  });

  it("updates the selected worksheet summary from the selected worksheet data", () => {
    const markup = renderToStaticMarkup(createElement(SelectedWorksheetSummary, {
      worksheet: worksheet("Pricebook 4", 2_500, 12),
      previewedRowCount: 100
    }));

    expect(markup).toContain("Selected sheet");
    expect(markup).toContain("Pricebook 4");
    expect(markup).toContain("2,500 rows");
    expect(markup).toContain("12 columns");
    expect(markup).toContain("Showing first 100 rows");
    expect(markup).toContain("No issues found");
    expect(markup).not.toContain("badge danger");
  });

  it("states when every worksheet data row is shown", () => {
    const smallWorksheet = worksheet("Small sheet", 43, 12);

    expect(worksheetPreviewRowDescription(smallWorksheet, 42)).toBe("Showing all 42 rows");
    expect(worksheetPreviewRowDescription(worksheet("Single row", 2, 12), 1)).toBe("Showing all 1 row");
  });

  it("derives per-sheet counts once from the canonical validation issue list", () => {
    const counts = countWorksheetIssues([
      { worksheetName: "Errors only", severity: "Error" },
      { worksheetName: "Errors only", severity: "Error" },
      { worksheetName: "Warnings only", severity: "Warning" },
      { worksheetName: "Both", severity: "Error" },
      { worksheetName: "Both", severity: "Warning" }
    ]);

    expect(counts.get("Errors only")).toEqual({ errorCount: 2, warningCount: 0 });
    expect(counts.get("Warnings only")).toEqual({ errorCount: 0, warningCount: 1 });
    expect(counts.get("Both")).toEqual({ errorCount: 1, warningCount: 1 });
    expect(counts.has("Clean")).toBe(false);
  });

  it("updates the compact issue summary for the selected worksheet", () => {
    const errorsMarkup = renderToStaticMarkup(createElement(SelectedWorksheetSummary, {
      worksheet: worksheet("Errors only"),
      previewedRowCount: 100,
      issueCounts: { errorCount: 14, warningCount: 0 }
    }));
    const bothMarkup = renderToStaticMarkup(createElement(SelectedWorksheetSummary, {
      worksheet: worksheet("Both"),
      previewedRowCount: 100,
      issueCounts: { errorCount: 3, warningCount: 7 }
    }));

    expect(errorsMarkup).toContain("Errors: 14");
    expect(errorsMarkup).not.toContain("Warnings:");
    expect(bothMarkup).toContain("Errors: 3");
    expect(bothMarkup).toContain("Warnings: 7");
    expect(bothMarkup).toContain("Selected worksheet validation: 3 errors, 7 warnings");
  });

  it("renders clean, error, warning and combined tab states with accessible counts", () => {
    const worksheets = [worksheet("Clean"), worksheet("Errors only"), worksheet("Warnings only"), worksheet("Both")];
    const issueCountsByWorksheet = new Map([
      ["Errors only", { errorCount: 2, warningCount: 0 }],
      ["Warnings only", { errorCount: 0, warningCount: 4 }],
      ["Both", { errorCount: 3, warningCount: 5 }]
    ]);
    const markup = renderToStaticMarkup(createElement(WorksheetTabs, {
      worksheets,
      selectedWorksheetName: "Both",
      issueCountsByWorksheet,
      onSelectWorksheet: vi.fn()
    }));

    expect(markup).toContain('class="worksheetTab"');
    expect(markup).toContain('class="worksheetTab hasErrors"');
    expect(markup).toContain('class="worksheetTab hasWarnings"');
    expect(markup).toContain('class="worksheetTab hasErrorsAndWarnings"');
    expect(markup).toContain('aria-label="Clean — No validation issues"');
    expect(markup).toContain('aria-label="Errors only — 2 errors"');
    expect(markup).toContain('aria-label="Warnings only — 4 warnings"');
    expect(markup).toContain('aria-label="Both — 3 errors, 5 warnings"');
    expect(markup).toContain("2 errors");
    expect(markup).toContain("4 warnings");
  });

  it("configures worksheet navigation to wrap without a horizontal scrollbar", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const tabsRule = css.match(/\.worksheetTabs\s*\{([^}]*)\}/)?.[1] ?? "";
    const wrapperRule = css.match(/\.worksheetTabsWrap\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(tabsRule).toMatch(/flex-wrap:\s*wrap/);
    expect(tabsRule).toMatch(/min-width:\s*0/);
    expect(wrapperRule).not.toMatch(/overflow-x:\s*auto/);
    expect(css).not.toContain("worksheetTabsScroller");
  });
});
