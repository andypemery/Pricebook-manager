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
      `Legacy .xls workbooks are not supported by this importer. Please open '${fileName}' in Excel, save it as .xlsx or .xlsm, and upload the saved copy.`,
      fileName
    );
  }

  if (!workbookExtension(fileName)) {
    throw new ExcelImportError("INVALID_FILE_TYPE", `The file '${fileName}' is not a supported Excel workbook. Upload a .xlsx or .xlsm file.`, fileName);
  }
}

export function workbookNameFromFile(fileName: string) {
  return fileName.replace(/\.(xlsx|xlsm)$/i, "");
}
