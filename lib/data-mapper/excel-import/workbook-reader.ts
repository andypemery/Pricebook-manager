import ExcelJS from "exceljs";
import type { WorkbookSummary } from "@/lib/data-mapper/types";
import { ExcelImportError, workbookReadFailureMessage } from "@/lib/data-mapper/excel-import/errors";
import { assertSupportedWorkbookFile } from "@/lib/data-mapper/excel-import/file-validation";
import { createWorkbookSummary } from "@/lib/data-mapper/excel-import/workbook-summary";

export type WorkbookReadResult = {
  workbook: ExcelJS.Workbook;
  summary: WorkbookSummary;
};

function isEncryptedWorkbookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /password|encrypted|decrypt|encryption/i.test(message);
}

function logWorkbookReadError(fileName: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  if (error instanceof Error) {
    console.error("[Axiom Data Mapper] ExcelJS workbook read failed", {
      fileName,
      message: error.message,
      stack: error.stack,
      error
    });
    return;
  }
  console.error("[Axiom Data Mapper] ExcelJS workbook read failed", { fileName, error });
}

export async function readWorkbook(file: File): Promise<WorkbookReadResult> {
  assertSupportedWorkbookFile(file.name);

  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
  } catch (error) {
    logWorkbookReadError(file.name, error);
    throw new ExcelImportError(isEncryptedWorkbookError(error) ? "PASSWORD_PROTECTED_WORKBOOK" : "CORRUPT_WORKBOOK", workbookReadFailureMessage(file.name), file.name);
  }

  if (workbook.worksheets.length === 0) {
    throw new ExcelImportError("EMPTY_WORKBOOK", `The workbook '${file.name}' does not contain any worksheets. Please check the file and try again.`, file.name);
  }

  const summary = createWorkbookSummary(workbook, file.name);
  if (summary.worksheets.every((worksheet) => worksheet.rowCount === 0)) {
    throw new ExcelImportError("EMPTY_WORKBOOK", `The workbook '${file.name}' does not contain any usable worksheet data. Please check the file and try again.`, file.name);
  }

  return { workbook, summary };
}
