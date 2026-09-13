export const outputProfilePreviewRowLimit = 3;

export const outputColumnTypes = ["SOURCE", "STATIC"] as const;
export type OutputColumnType = (typeof outputColumnTypes)[number];

export const adjustmentTypes = ["NONE", "MULTIPLY", "DIVIDE", "PERCENT_INCREASE", "PERCENT_DECREASE"] as const;
export type OutputValueAdjustmentType = (typeof adjustmentTypes)[number];

export type RoundingDecimalPlaces = 0 | 1 | 2 | 3 | 4 | null;

export const filterMatchModes = ["ALL", "ANY"] as const;
export type OutputProfileFilterMatchMode = (typeof filterMatchModes)[number];

export const filterOperators = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "IS_BLANK",
  "IS_NOT_BLANK",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL"
] as const;
export type OutputProfileFilterOperator = (typeof filterOperators)[number];

export type SourceWorksheetPreview = {
  id: string;
  sourceWorkbookImportId: string;
  workbookFileName: string;
  worksheetName: string;
  headers: string[];
  sampleRows: string[][];
};

export type OutputProfileColumnDraft = {
  clientId: string;
  columnType: OutputColumnType;
  sourceColumnIndex: number | null;
  sourceHeading: string | null;
  outputHeading: string;
  staticValue: string;
  adjustmentType: OutputValueAdjustmentType;
  adjustmentValue: string;
  roundingDecimalPlaces: RoundingDecimalPlaces;
};

export type OutputProfileFilterDraft = {
  clientId: string;
  sourceColumnIndex: number;
  sourceHeading: string;
  operator: OutputProfileFilterOperator;
  comparisonValue: string;
};

export type OutputProfileDraft = {
  id: string | null;
  name: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  columns: OutputProfileColumnDraft[];
  filterMatchMode: OutputProfileFilterMatchMode;
  filters: OutputProfileFilterDraft[];
};

export type SaveOutputProfileInput = {
  id?: string | null;
  name: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  columns: Array<Omit<OutputProfileColumnDraft, "clientId">>;
  filterMatchMode: OutputProfileFilterMatchMode;
  filters: Array<Omit<OutputProfileFilterDraft, "clientId">>;
};

export type SaveOutputProfileResult =
  | { ok: true; profileId: string; message: string }
  | { ok: false; error: string };
