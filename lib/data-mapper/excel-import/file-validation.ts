import type { SupportedWorkbookExtension } from "@/lib/data-mapper/types";
import { ExcelImportError } from "@/lib/data-mapper/excel-import/errors";

const supportedExtensions: SupportedWorkbookExtension[] = [".xlsx", ".xlsm"];

export function workbookExtension(fileName: string): SupportedWorkbookExtension | null {
  const lowerName = fileName.toLowerCase();
  const extension = supportedExtensions.find((candidate) => lowerName.endsWith(candidate));
  return extension ?? null;
}

export function assertSupportedWorkbookFile(fileName: string) {
  if (fileName.toLowerCase().endsWith(".xls")) {
    throw new ExcelImportError(
      "INVALID_FILE_TYPE",
      "Legacy .xls workbooks are not supported by the safer Excel import library. Save the workbook as .xlsx or .xlsm and upload it again."
    );
  }

  if (!workbookExtension(fileName)) {
    throw new ExcelImportError("INVALID_FILE_TYPE", "Upload an Excel workbook in .xlsx or .xlsm format.");
  }
}

export function workbookNameFromFile(fileName: string) {
  return fileName.replace(/\.(xlsx|xlsm)$/i, "");
}
