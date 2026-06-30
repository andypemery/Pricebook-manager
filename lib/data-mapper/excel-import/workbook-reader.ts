import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import type { WorkbookSummary } from "@/lib/data-mapper/types";
import { ExcelImportError } from "@/lib/data-mapper/excel-import/errors";
import { assertSupportedWorkbookFile } from "@/lib/data-mapper/excel-import/file-validation";
import { createWorkbookSummary } from "@/lib/data-mapper/excel-import/workbook-summary";

export type WorkbookReadResult = {
  workbook: WorkBook;
  summary: WorkbookSummary;
};

export async function readWorkbook(file: File): Promise<WorkbookReadResult> {
  assertSupportedWorkbookFile(file.name);

  let workbook: WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      dense: false,
      WTF: false
    });
  } catch {
    throw new ExcelImportError("CORRUPT_WORKBOOK", "The workbook could not be read. It may be corrupt or password protected.");
  }

  if (workbook.SheetNames.length === 0) {
    throw new ExcelImportError("EMPTY_WORKBOOK", "The workbook does not contain any worksheets.");
  }

  const summary = createWorkbookSummary(workbook, file.name);
  if (summary.worksheets.every((worksheet) => worksheet.rowCount === 0)) {
    throw new ExcelImportError("EMPTY_WORKBOOK", "The workbook does not contain any worksheet data.");
  }

  return { workbook, summary };
}
