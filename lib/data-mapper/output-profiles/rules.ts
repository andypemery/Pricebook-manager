import type {
  OutputProfileColumnDraft,
  OutputProfileFilterDraft,
  OutputProfileFilterMatchMode,
  OutputProfileFilterOperator,
  OutputValueAdjustmentType,
  RoundingDecimalPlaces
} from "@/lib/data-mapper/output-profiles/types";

type ParsedDecimal = { coefficient: bigint; scale: number };
type RationalValue = { numerator: bigint; denominator: bigint; naturalScale: number };

const decimalPattern = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;
const maximumDecimalCharacters = 100;
const defaultDivisionDecimalPlaces = 12;

export const adjustmentLabels: Record<OutputValueAdjustmentType, string> = {
  NONE: "None",
  MULTIPLY: "Multiply by",
  DIVIDE: "Divide by",
  PERCENT_INCREASE: "Increase by percentage",
  PERCENT_DECREASE: "Decrease by percentage"
};

export const filterOperatorLabels: Record<OutputProfileFilterOperator, string> = {
  EQUALS: "Equals",
  NOT_EQUALS: "Does not equal",
  CONTAINS: "Contains",
  NOT_CONTAINS: "Does not contain",
  STARTS_WITH: "Starts with",
  IS_BLANK: "Is blank",
  IS_NOT_BLANK: "Is not blank",
  GREATER_THAN: "Greater than",
  GREATER_THAN_OR_EQUAL: "Greater than or equal",
  LESS_THAN: "Less than",
  LESS_THAN_OR_EQUAL: "Less than or equal"
};

export const numericFilterOperators = new Set<OutputProfileFilterOperator>([
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL"
]);

export function filterOperatorNeedsValue(operator: OutputProfileFilterOperator) {
  return operator !== "IS_BLANK" && operator !== "IS_NOT_BLANK";
}

function powerOfTen(exponent: number) {
  return 10n ** BigInt(exponent);
}

export function parseDecimal(value: string): ParsedDecimal | null {
  const normalised = value.trim().replaceAll(",", "");
  if (!normalised || normalised.length > maximumDecimalCharacters) return null;
  const match = decimalPattern.exec(normalised);
  if (!match) return null;
  const fractionalPart = match[3] ?? match[4] ?? "";
  if (fractionalPart.length > maximumDecimalCharacters) return null;
  const sign = match[1] === "-" ? -1n : 1n;
  return { coefficient: sign * BigInt(`${match[2] ?? "0"}${fractionalPart}`), scale: fractionalPart.length };
}

export function canonicalDecimalString(value: string) {
  const decimal = parseDecimal(value);
  if (!decimal) return null;
  return formatRational(
    { numerator: decimal.coefficient, denominator: powerOfTen(decimal.scale), naturalScale: decimal.scale },
    decimal.scale,
    false
  );
}

function compareDecimals(left: ParsedDecimal, right: ParsedDecimal) {
  const leftScaled = left.coefficient * powerOfTen(right.scale);
  const rightScaled = right.coefficient * powerOfTen(left.scale);
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function rationalForAdjustment(source: ParsedDecimal, adjustmentType: OutputValueAdjustmentType, adjustmentValue: ParsedDecimal | null): RationalValue | null {
  if (adjustmentType === "NONE") {
    return { numerator: source.coefficient, denominator: powerOfTen(source.scale), naturalScale: source.scale };
  }
  if (!adjustmentValue) return null;
  if (adjustmentType === "MULTIPLY") {
    return {
      numerator: source.coefficient * adjustmentValue.coefficient,
      denominator: powerOfTen(source.scale + adjustmentValue.scale),
      naturalScale: source.scale + adjustmentValue.scale
    };
  }
  if (adjustmentType === "DIVIDE") {
    if (adjustmentValue.coefficient === 0n) return null;
    return {
      numerator: source.coefficient * powerOfTen(adjustmentValue.scale),
      denominator: powerOfTen(source.scale) * adjustmentValue.coefficient,
      naturalScale: defaultDivisionDecimalPlaces
    };
  }
  const hundredAtAdjustmentScale = 100n * powerOfTen(adjustmentValue.scale);
  const percentageFactor = adjustmentType === "PERCENT_INCREASE"
    ? hundredAtAdjustmentScale + adjustmentValue.coefficient
    : hundredAtAdjustmentScale - adjustmentValue.coefficient;
  return {
    numerator: source.coefficient * percentageFactor,
    denominator: powerOfTen(source.scale + adjustmentValue.scale) * 100n,
    naturalScale: source.scale + adjustmentValue.scale + 2
  };
}

function formatRational(value: RationalValue, decimalPlaces: number, preserveTrailingZeroes: boolean) {
  let numerator = value.numerator;
  let denominator = value.denominator;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const absoluteNumerator = negative ? -numerator : numerator;
  const scaledNumerator = absoluteNumerator * powerOfTen(decimalPlaces);
  let rounded = scaledNumerator / denominator;
  const remainder = scaledNumerator % denominator;
  if (remainder * 2n >= denominator) rounded += 1n;

  const digits = rounded.toString().padStart(decimalPlaces + 1, "0");
  const integerPart = decimalPlaces === 0 ? digits : digits.slice(0, -decimalPlaces);
  let fractionalPart = decimalPlaces === 0 ? "" : digits.slice(-decimalPlaces);
  if (!preserveTrailingZeroes) fractionalPart = fractionalPart.replace(/0+$/, "");
  const sign = negative && rounded !== 0n ? "-" : "";
  return fractionalPart ? `${sign}${integerPart}.${fractionalPart}` : `${sign}${integerPart}`;
}

export function transformNumericValue(
  sourceValue: string,
  adjustmentType: OutputValueAdjustmentType,
  adjustmentValue: string,
  roundingDecimalPlaces: RoundingDecimalPlaces
) {
  if (adjustmentType === "NONE" && roundingDecimalPlaces === null) return sourceValue;
  const source = parseDecimal(sourceValue);
  if (!source) return sourceValue;
  const adjustment = adjustmentType === "NONE" ? null : parseDecimal(adjustmentValue);
  const rational = rationalForAdjustment(source, adjustmentType, adjustment);
  if (!rational) return sourceValue;
  const decimalPlaces = roundingDecimalPlaces ?? Math.min(rational.naturalScale, defaultDivisionDecimalPlaces);
  return formatRational(rational, decimalPlaces, roundingDecimalPlaces !== null);
}

export function sourceRowMatchesFilter(sourceRow: readonly string[], filter: Omit<OutputProfileFilterDraft, "clientId">) {
  const sourceValue = sourceRow[filter.sourceColumnIndex] ?? "";
  const sourceText = sourceValue.trim();
  if (filter.operator === "IS_BLANK") return sourceText.length === 0;
  if (filter.operator === "IS_NOT_BLANK") return sourceText.length > 0;

  const comparisonText = filter.comparisonValue.trim();
  if (numericFilterOperators.has(filter.operator)) {
    const sourceNumber = parseDecimal(sourceText);
    const comparisonNumber = parseDecimal(comparisonText);
    if (!sourceNumber || !comparisonNumber) return false;
    const comparison = compareDecimals(sourceNumber, comparisonNumber);
    if (filter.operator === "GREATER_THAN") return comparison > 0;
    if (filter.operator === "GREATER_THAN_OR_EQUAL") return comparison >= 0;
    if (filter.operator === "LESS_THAN") return comparison < 0;
    return comparison <= 0;
  }

  const normalisedSource = sourceText.toLocaleLowerCase("en-GB");
  const normalisedComparison = comparisonText.toLocaleLowerCase("en-GB");
  if (filter.operator === "EQUALS") return normalisedSource === normalisedComparison;
  if (filter.operator === "NOT_EQUALS") return normalisedSource !== normalisedComparison;
  if (filter.operator === "CONTAINS") return normalisedSource.includes(normalisedComparison);
  if (filter.operator === "NOT_CONTAINS") return !normalisedSource.includes(normalisedComparison);
  return normalisedSource.startsWith(normalisedComparison);
}

export function filterSourceRows(
  sampleRows: readonly (readonly string[])[],
  filters: readonly Omit<OutputProfileFilterDraft, "clientId">[],
  matchMode: OutputProfileFilterMatchMode
) {
  if (filters.length === 0) return sampleRows.slice(0, 3);
  return sampleRows.slice(0, 3).filter((sourceRow) => matchMode === "ALL"
    ? filters.every((filter) => sourceRowMatchesFilter(sourceRow, filter))
    : filters.some((filter) => sourceRowMatchesFilter(sourceRow, filter)));
}

export function outputValueForColumn(column: OutputProfileColumnDraft, sourceRow: readonly string[]) {
  if (column.columnType === "STATIC") return column.staticValue;
  const sourceValue = column.sourceColumnIndex === null ? "" : sourceRow[column.sourceColumnIndex] ?? "";
  return transformNumericValue(sourceValue, column.adjustmentType, column.adjustmentValue, column.roundingDecimalPlaces);
}

export function describeColumnRule(column: OutputProfileColumnDraft) {
  if (column.columnType === "STATIC") return `Fixed value: ${column.staticValue || "blank"}`;
  const parts: string[] = [];
  if (column.adjustmentType === "MULTIPLY") parts.push(`× ${column.adjustmentValue || "…"}`);
  if (column.adjustmentType === "DIVIDE") parts.push(`÷ ${column.adjustmentValue || "…"}`);
  if (column.adjustmentType === "PERCENT_INCREASE") parts.push(`Increase ${column.adjustmentValue || "…"}%`);
  if (column.adjustmentType === "PERCENT_DECREASE") parts.push(`Decrease ${column.adjustmentValue || "…"}%`);
  if (column.roundingDecimalPlaces !== null) parts.push(`Round to ${column.roundingDecimalPlaces} dp`);
  return parts.join(" · ");
}

export function buildOutputPreview(
  columns: readonly OutputProfileColumnDraft[],
  sampleRows: readonly (readonly string[])[],
  filters: readonly Omit<OutputProfileFilterDraft, "clientId">[],
  matchMode: OutputProfileFilterMatchMode
) {
  const matchingSourceRows = filterSourceRows(sampleRows, filters, matchMode);
  return {
    matchingSourceRows,
    outputRows: matchingSourceRows.map((sourceRow) => columns.map((column) => outputValueForColumn(column, sourceRow)))
  };
}
