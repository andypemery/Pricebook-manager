import type { SaveOutputProfileInput } from "@/lib/data-mapper/output-profiles/types";

const maximumProfileNameLength = 120;
const maximumHeadingLength = 200;
const maximumOutputColumns = 500;

export class OutputProfileValidationError extends Error {}

function requiredText(value: unknown, label: string, maximumLength: number) {
  if (typeof value !== "string") throw new OutputProfileValidationError(`${label} is required.`);
  const text = value.trim();
  if (!text) throw new OutputProfileValidationError(`${label} is required.`);
  if (text.length > maximumLength) throw new OutputProfileValidationError(`${label} must be ${maximumLength} characters or fewer.`);
  return text;
}

export function validateOutputProfileInput(input: SaveOutputProfileInput, canonicalHeaders: readonly string[]) {
  const name = requiredText(input.name, "Profile name", maximumProfileNameLength);
  const sourceWorkbookImportId = requiredText(input.sourceWorkbookImportId, "Source workbook", 100);
  const sourceWorksheetId = requiredText(input.sourceWorksheetId, "Source worksheet", 100);

  if (!Array.isArray(input.columns)) throw new OutputProfileValidationError("Output columns must be supplied as a list.");
  if (input.columns.length > maximumOutputColumns) {
    throw new OutputProfileValidationError(`An Output Profile can contain no more than ${maximumOutputColumns} columns.`);
  }

  const columns = input.columns.map((column) => {
    if (!Number.isInteger(column.sourceColumnIndex) || column.sourceColumnIndex < 0 || column.sourceColumnIndex >= canonicalHeaders.length) {
      throw new OutputProfileValidationError("An output column refers to a source column that does not exist.");
    }
    const canonicalHeading = canonicalHeaders[column.sourceColumnIndex];
    if (column.sourceHeading !== canonicalHeading) {
      throw new OutputProfileValidationError("A source heading does not match the validated worksheet metadata.");
    }
    return {
      sourceColumnIndex: column.sourceColumnIndex,
      sourceHeading: canonicalHeading,
      outputHeading: requiredText(column.outputHeading, "Output heading", maximumHeadingLength)
    };
  });

  return { id: input.id ?? null, name, sourceWorkbookImportId, sourceWorksheetId, columns };
}

export function stringArrayFromJson(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} is not valid string-array metadata.`);
  }
  return value as string[];
}

export function stringMatrixFromJson(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell !== "string"))) {
    throw new Error(`${label} is not valid preview metadata.`);
  }
  return value as string[][];
}
