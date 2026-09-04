import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CompactWorkbookSummary,
  SelectedWorksheetSummary,
  WorksheetTabs,
  nextWorksheetTabIndex
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
      onSelectWorksheet: vi.fn()
    }));

    expect(markup.match(/role="tab"/g)).toHaveLength(10);
    expect(markup).toContain("role=\"tablist\"");
    expect(markup).toContain("aria-selected=\"true\"");
    expect(markup).toContain("title=\"Regional Enterprise Pricebook 9\"");
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
    expect(markup).toContain("100 rows previewed");
  });
});
