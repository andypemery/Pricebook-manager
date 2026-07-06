export type ExcelImportErrorCode =
  | "INVALID_FILE_TYPE"
  | "CORRUPT_WORKBOOK"
  | "PASSWORD_PROTECTED_WORKBOOK"
  | "EMPTY_WORKBOOK"
  | "EMPTY_WORKSHEET"
  | "MISSING_HEADERS";

export class ExcelImportError extends Error {
  constructor(
    public readonly code: ExcelImportErrorCode,
    message: string,
    public readonly fileName?: string
  ) {
    super(message);
    this.name = "ExcelImportError";
  }
}

export function workbookReadFailureMessage(fileName: string) {
  return `The workbook '${fileName}' could not be read. It may be password protected, damaged, or saved in a format this importer cannot safely read. Please open the file in Excel, save it again as .xlsx, and try uploading the saved copy.`;
}

export function friendlyExcelImportMessage(error: unknown): string {
  if (error instanceof ExcelImportError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The workbook could not be imported. Please check the file and try again.";
}
