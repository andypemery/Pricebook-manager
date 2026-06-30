import type ExcelJS from "exceljs";
import type { WorksheetPreview, WorksheetSummary } from "@/lib/data-mapper/types";
import { detectHeaderRow, displayHeaders } from "@/lib/data-mapper/excel-import/header-detection";

const headerScanLimit = 25;
export const previewRowLimit = 100;

function cellValueToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellValueToText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("hyperlink" in value && "text" in value && typeof value.text === "string") return value.text.trim();
    return "";
  }
  return String(value).trim();
}

function rowMatrix(worksheet: ExcelJS.Worksheet, columnCount: number, maxRows?: number) {
  const rowLimit = maxRows ? Math.min(maxRows, worksheet.rowCount) : worksheet.rowCount;
  return Array.from({ length: rowLimit }, (_, rowOffset) => {
    const row = worksheet.getRow(rowOffset + 1);
    return Array.from({ length: columnCount }, (_, columnOffset) => cellValueToText(row.getCell(columnOffset + 1).value));
  });
}

export function createWorksheetSummary(name: string, worksheet: ExcelJS.Worksheet): WorksheetSummary {
  const rowCount = worksheet.actualRowCount;
  const columnCount = worksheet.actualColumnCount;

  if (rowCount === 0 || columnCount === 0) {
    return {
      name,
      rowCount: 0,
      columnCount: 0,
      detectedHeaderRow: null,
      headers: [],
      importStatus: "Empty worksheet",
      message: "This worksheet is empty."
    };
  }

  const rows = rowMatrix(worksheet, columnCount, headerScanLimit);
  const headerDetection = detectHeaderRow(rows);
  const hasHeaders = headerDetection.rowNumber !== null;

  return {
    name,
    rowCount,
    columnCount,
    detectedHeaderRow: headerDetection.rowNumber,
    headers: displayHeaders(headerDetection.headers, columnCount),
    importStatus: hasHeaders ? "Ready" : "Missing headers",
    message: headerDetection.message
  };
}

export function createWorksheetPreview(name: string, worksheet: ExcelJS.Worksheet, summary: WorksheetSummary): WorksheetPreview {
  if (summary.rowCount === 0 || summary.detectedHeaderRow === null) {
    return {
      worksheetName: name,
      headers: summary.headers,
      rows: [],
      sourceRowCount: summary.rowCount,
      previewRowLimit
    };
  }

  const rows = rowMatrix(worksheet, summary.columnCount, summary.detectedHeaderRow + previewRowLimit);
  const dataRows = rows.slice(summary.detectedHeaderRow, summary.detectedHeaderRow + previewRowLimit);
  return {
    worksheetName: name,
    headers: summary.headers,
    rows: dataRows.map((row) => Array.from({ length: summary.columnCount }, (_, index) => row[index] ?? "")),
    sourceRowCount: summary.rowCount,
    previewRowLimit
  };
}
