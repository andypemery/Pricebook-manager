import { canonicalDecimalString, filterOperatorNeedsValue, numericFilterOperators, parseDecimal } from "@/lib/data-mapper/output-profiles/rules";
import { resolveOutputFilename } from "@/lib/data-mapper/output-profiles/filename";
import { validateWorksheetName } from "@/lib/data-mapper/output-profiles/configuration";
import {
  adjustmentTypes,
  csvDelimiters,
  filterMatchModes,
  filterOperators,
  outputColumnTypes,
  outputFormats,
  type SaveOutputProfileInput
} from "@/lib/data-mapper/output-profiles/types";

const maximumProfileNameLength = 120;
const maximumHeadingLength = 200;
const maximumStaticValueLength = 500;
const maximumComparisonValueLength = 500;
const maximumAdjustmentValueLength = 100;
const maximumOutputColumns = 500;
const maximumFilters = 100;

export class OutputProfileValidationError extends Error {}

function requiredText(value: unknown, label: string, maximumLength: number) {
  if (typeof value !== "string") throw new OutputProfileValidationError(`${label} is required.`);
  const text = value.trim();
  if (!text) throw new OutputProfileValidationError(`${label} is required.`);
  if (text.length > maximumLength) throw new OutputProfileValidationError(`${label} must be ${maximumLength} characters or fewer.`);
  return text;
}

function boundedText(value: unknown, label: string, maximumLength: number) {
  if (typeof value !== "string") throw new OutputProfileValidationError(`${label} must be text.`);
  if (value.length > maximumLength) throw new OutputProfileValidationError(`${label} must be ${maximumLength} characters or fewer.`);
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new OutputProfileValidationError(`${label} is not supported.`);
  return value as T;
}

function canonicalSourceReference(sourceColumnIndex: unknown, sourceHeading: unknown, canonicalHeaders: readonly string[], context: string) {
  if (!Number.isInteger(sourceColumnIndex) || (sourceColumnIndex as number) < 0 || (sourceColumnIndex as number) >= canonicalHeaders.length) {
    throw new OutputProfileValidationError(`${context} refers to a source column that does not exist.`);
  }
  const index = sourceColumnIndex as number;
  const canonicalHeading = canonicalHeaders[index];
  if (sourceHeading !== canonicalHeading) {
    throw new OutputProfileValidationError(`${context} source heading does not match the validated worksheet metadata.`);
  }
  return { sourceColumnIndex: index, sourceHeading: canonicalHeading };
}

function validateRounding(value: unknown) {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) {
    throw new OutputProfileValidationError("Rounding must be between 0 and 4 decimal places.");
  }
  return value as 0 | 1 | 2 | 3 | 4;
}

function persistedDecimal(value: string, label: string) {
  const canonical = canonicalDecimalString(value);
  if (!canonical) throw new OutputProfileValidationError(`${label} must be a valid finite number.`);
  const decimal = parseDecimal(canonical);
  if (!decimal) throw new OutputProfileValidationError(`${label} must be a valid finite number.`);
  const integerDigits = Math.max(1, decimal.coefficient.toString().replace("-", "").length - decimal.scale);
  if (decimal.scale > 12 || integerDigits > 18) {
    throw new OutputProfileValidationError(`${label} supports up to 18 whole-number digits and 12 decimal places.`);
  }
  return { canonical, decimal };
}

export function validateOutputProfileInput(
  input: SaveOutputProfileInput,
  canonicalHeaders: readonly string[],
  canonicalSourceFilename = "source.xlsx"
) {
  if (!input || typeof input !== "object") throw new OutputProfileValidationError("Output Profile configuration is required.");
  const id = input.id === null || input.id === undefined ? null : requiredText(input.id, "Output Profile", 100);
  const name = requiredText(input.name, "Profile name", maximumProfileNameLength);
  const outputFormat = oneOf(input.outputFormat, outputFormats, "Output format");
  const csvDelimiter = oneOf(input.csvDelimiter, csvDelimiters, "CSV delimiter");
  if (typeof input.csvIncludeHeader !== "boolean") throw new OutputProfileValidationError("CSV header setting must be yes or no.");
  if (typeof input.xlsxWorksheetName !== "string") throw new OutputProfileValidationError("Worksheet name must be text.");
  const filename = resolveOutputFilename({
    filenameTemplate: input.filenameTemplate,
    profileName: name,
    sourceFilename: canonicalSourceFilename,
    effectiveDate: "2000-01-01",
    outputFormat
  });
  if (filename.errors[0]) throw new OutputProfileValidationError(filename.errors[0]);
  const xlsxWorksheetName = outputFormat === "XLSX" ? input.xlsxWorksheetName.trim() : null;
  if (outputFormat === "XLSX") {
    const worksheetIssue = validateWorksheetName(xlsxWorksheetName);
    if (worksheetIssue) throw new OutputProfileValidationError(worksheetIssue);
  }
  const sourceWorkbookImportId = requiredText(input.sourceWorkbookImportId, "Source workbook", 100);
  const sourceWorksheetId = requiredText(input.sourceWorksheetId, "Source worksheet", 100);
  const filterMatchMode = oneOf(input.filterMatchMode, filterMatchModes, "Filter match mode");

  if (!Array.isArray(input.columns)) throw new OutputProfileValidationError("Output columns must be supplied as a list.");
  if (input.columns.length > maximumOutputColumns) {
    throw new OutputProfileValidationError(`An Output Profile can contain no more than ${maximumOutputColumns} columns.`);
  }

  const columns = input.columns.map((column) => {
    if (!column || typeof column !== "object") throw new OutputProfileValidationError("An output column is malformed.");
    const columnType = oneOf(column.columnType, outputColumnTypes, "Output column type");
    const outputHeading = requiredText(column.outputHeading, "Output heading", maximumHeadingLength);

    if (columnType === "STATIC") {
      if (column.sourceColumnIndex !== null || column.sourceHeading !== null) {
        throw new OutputProfileValidationError("A fixed-value column cannot contain a source-column reference.");
      }
      if (column.adjustmentType !== "NONE" || column.adjustmentValue !== "" || column.roundingDecimalPlaces !== null) {
        throw new OutputProfileValidationError("A fixed-value column cannot contain numeric source adjustments or rounding.");
      }
      return {
        columnType,
        sourceColumnIndex: null,
        sourceHeading: null,
        outputHeading,
        staticValue: boundedText(column.staticValue, "Fixed value", maximumStaticValueLength),
        adjustmentType: "NONE" as const,
        adjustmentValue: null,
        roundingDecimalPlaces: null
      };
    }

    const source = canonicalSourceReference(column.sourceColumnIndex, column.sourceHeading, canonicalHeaders, "An output column");
    const adjustmentType = oneOf(column.adjustmentType, adjustmentTypes, "Value adjustment");
    const roundingDecimalPlaces = validateRounding(column.roundingDecimalPlaces);
    if (column.staticValue !== "") throw new OutputProfileValidationError("A source-backed column cannot contain a fixed value.");

    let adjustmentValue: string | null = null;
    if (adjustmentType === "NONE") {
      if (column.adjustmentValue !== "") throw new OutputProfileValidationError("No adjustment value is allowed when adjustment is None.");
    } else {
      const suppliedAdjustment = requiredText(column.adjustmentValue, "Adjustment value", maximumAdjustmentValueLength);
      const persisted = persistedDecimal(suppliedAdjustment, "Adjustment value");
      adjustmentValue = persisted.canonical;
      const decimal = persisted.decimal;
      if (adjustmentType === "DIVIDE" && decimal.coefficient === 0n) throw new OutputProfileValidationError("Divide by zero is not allowed.");
      if ((adjustmentType === "PERCENT_INCREASE" || adjustmentType === "PERCENT_DECREASE") && decimal.coefficient < 0n) {
        throw new OutputProfileValidationError("Percentage adjustments cannot be negative.");
      }
    }

    return {
      columnType,
      ...source,
      outputHeading,
      staticValue: null,
      adjustmentType,
      adjustmentValue,
      roundingDecimalPlaces
    };
  });

  if (!Array.isArray(input.filters)) throw new OutputProfileValidationError("Filters must be supplied as a list.");
  if (input.filters.length > maximumFilters) throw new OutputProfileValidationError(`An Output Profile can contain no more than ${maximumFilters} filters.`);
  const filters = input.filters.map((filter) => {
    if (!filter || typeof filter !== "object") throw new OutputProfileValidationError("A filter is malformed.");
    const source = canonicalSourceReference(filter.sourceColumnIndex, filter.sourceHeading, canonicalHeaders, "A filter");
    const operator = oneOf(filter.operator, filterOperators, "Filter operator");
    let comparisonValue: string | null = null;
    if (filterOperatorNeedsValue(operator)) {
      comparisonValue = requiredText(filter.comparisonValue, "Filter comparison value", maximumComparisonValueLength);
      if (numericFilterOperators.has(operator)) {
        const persisted = persistedDecimal(comparisonValue, "A numeric filter comparison");
        comparisonValue = persisted.canonical;
      }
    } else if (filter.comparisonValue !== "") {
      throw new OutputProfileValidationError("Blank filters cannot contain a comparison value.");
    }
    return { ...source, operator, comparisonValue };
  });

  return {
    id,
    name,
    filenameTemplate: filename.cleanTemplate,
    outputFormat,
    csvDelimiter,
    csvIncludeHeader: input.csvIncludeHeader,
    xlsxWorksheetName,
    sourceWorkbookImportId,
    sourceWorksheetId,
    columns,
    filterMatchMode,
    filters
  };
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
