import type { WorkBook } from "xlsx";
import type { WorkbookSummary } from "@/lib/data-mapper/types";
import { workbookNameFromFile } from "@/lib/data-mapper/excel-import/file-validation";
import { createWorksheetSummary } from "@/lib/data-mapper/excel-import/worksheet-reader";

export function createWorkbookSummary(workbook: WorkBook, fileName: string): WorkbookSummary {
  const worksheets = workbook.SheetNames.map((sheetName) => createWorksheetSummary(sheetName, workbook.Sheets[sheetName]));

  return {
    workbookName: workbook.Props?.Title?.trim() || workbookNameFromFile(fileName),
    worksheetCount: worksheets.length,
    totalRows: worksheets.reduce((total, worksheet) => total + worksheet.rowCount, 0),
    totalColumns: worksheets.reduce((total, worksheet) => total + worksheet.columnCount, 0),
    worksheets
  };
}
