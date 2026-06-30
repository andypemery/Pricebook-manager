import * as XLSX from "xlsx";
import type { WorkSheet } from "xlsx";
import type { WorksheetPreview, WorksheetSummary } from "@/lib/data-mapper/types";
import { detectHeaderRow, displayHeaders } from "@/lib/data-mapper/excel-import/header-detection";

const headerScanLimit = 25;
export const previewRowLimit = 100;

function worksheetRange(worksheet: WorkSheet) {
  const ref = worksheet["!ref"];
  if (!ref) return null;
  return XLSX.utils.decode_range(ref);
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function rowMatrix(worksheet: WorkSheet, maxRows?: number) {
  const range = worksheetRange(worksheet);
  const boundedRange = range && maxRows
    ? { ...range, e: { ...range.e, r: Math.min(range.e.r, range.s.r + maxRows - 1) } }
    : undefined;

  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
    range: boundedRange
  });
}

export function createWorksheetSummary(name: string, worksheet: WorkSheet): WorksheetSummary {
  const range = worksheetRange(worksheet);
  if (!range) {
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

  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  const rows = rowMatrix(worksheet, headerScanLimit);
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

export function createWorksheetPreview(name: string, worksheet: WorkSheet, summary: WorksheetSummary): WorksheetPreview {
  const range = worksheetRange(worksheet);
  if (!range || summary.detectedHeaderRow === null) {
    return {
      worksheetName: name,
      headers: summary.headers,
      rows: [],
      sourceRowCount: summary.rowCount,
      previewRowLimit
    };
  }

  const rows = rowMatrix(worksheet, summary.detectedHeaderRow + previewRowLimit);
  const dataRows = rows.slice(summary.detectedHeaderRow, summary.detectedHeaderRow + previewRowLimit);
  return {
    worksheetName: name,
    headers: summary.headers,
    rows: dataRows.map((row) => Array.from({ length: summary.columnCount }, (_, index) => stringValue(row[index]))),
    sourceRowCount: summary.rowCount,
    previewRowLimit
  };
}
