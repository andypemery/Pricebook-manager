export type ExcelImportErrorCode =
  | "INVALID_FILE_TYPE"
  | "CORRUPT_WORKBOOK"
  | "EMPTY_WORKBOOK"
  | "EMPTY_WORKSHEET"
  | "MISSING_HEADERS";

export class ExcelImportError extends Error {
  constructor(
    public readonly code: ExcelImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ExcelImportError";
  }
}

export function friendlyExcelImportMessage(error: unknown): string {
  if (error instanceof ExcelImportError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The workbook could not be imported. Please check the file and try again.";
}
