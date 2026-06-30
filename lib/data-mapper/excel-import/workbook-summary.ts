import type ExcelJS from "exceljs";
import type { WorkbookSummary } from "@/lib/data-mapper/types";
import { workbookNameFromFile } from "@/lib/data-mapper/excel-import/file-validation";
import { createWorksheetSummary } from "@/lib/data-mapper/excel-import/worksheet-reader";

export function createWorkbookSummary(workbook: ExcelJS.Workbook, fileName: string): WorkbookSummary {
  const worksheets = workbook.worksheets.map((worksheet) => createWorksheetSummary(worksheet.name, worksheet));

  return {
    workbookName: workbookNameFromFile(fileName),
    worksheetCount: worksheets.length,
    totalRows: worksheets.reduce((total, worksheet) => total + worksheet.rowCount, 0),
    totalColumns: worksheets.reduce((total, worksheet) => total + worksheet.columnCount, 0),
    worksheets
  };
}
