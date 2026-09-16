export const maximumSourceWorkbookBytes = 20 * 1024 * 1024;

export const sourceWorkbookContentTypes = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12"
} as const;

export type SourceWorkbookExtension = keyof typeof sourceWorkbookContentTypes;

export type ValidatedSourceWorkbookDescriptor = {
  originalFileName: string;
  fileSizeBytes: number;
  extension: SourceWorkbookExtension;
  contentType: (typeof sourceWorkbookContentTypes)[SourceWorkbookExtension];
};

export class SourceWorkbookPolicyError extends Error {}

export function sourceWorkbookExtension(fileName: string): SourceWorkbookExtension | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension === "xlsx" || extension === "xlsm" ? extension : null;
}

export function validateSourceWorkbookDescriptor(input: {
  fileName: unknown;
  fileSizeBytes: unknown;
  contentType: unknown;
}): ValidatedSourceWorkbookDescriptor {
  const originalFileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (!originalFileName || originalFileName.length > 255 || /[\\/\u0000-\u001f]/.test(originalFileName)) {
    throw new SourceWorkbookPolicyError("Choose an Excel workbook with a valid filename.");
  }

  const extension = sourceWorkbookExtension(originalFileName);
  if (!extension) throw new SourceWorkbookPolicyError("Choose an .xlsx or .xlsm workbook to continue.");

  const fileSizeBytes = input.fileSizeBytes;
  if (!Number.isSafeInteger(fileSizeBytes) || Number(fileSizeBytes) <= 0) {
    throw new SourceWorkbookPolicyError("Choose a non-empty Excel workbook to continue.");
  }
  if (Number(fileSizeBytes) > maximumSourceWorkbookBytes) {
    throw new SourceWorkbookPolicyError("The workbook is larger than the 20 MB intake limit.");
  }

  const contentType = typeof input.contentType === "string" ? input.contentType.trim() : "";
  const canonicalContentType = sourceWorkbookContentTypes[extension];
  const acceptedDeclaredTypes = new Set(["", "application/octet-stream", canonicalContentType.toLowerCase()]);
  if (!acceptedDeclaredTypes.has(contentType.toLowerCase())) {
    throw new SourceWorkbookPolicyError("The selected file does not have a supported Excel workbook content type.");
  }

  return {
    originalFileName,
    fileSizeBytes: Number(fileSizeBytes),
    extension,
    contentType: canonicalContentType
  };
}
