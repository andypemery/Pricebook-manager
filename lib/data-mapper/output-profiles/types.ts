export const outputProfilePreviewRowLimit = 3;

export const outputColumnTypes = ["SOURCE", "STATIC"] as const;
export type OutputColumnType = (typeof outputColumnTypes)[number];

export const adjustmentTypes = ["NONE", "MULTIPLY", "DIVIDE", "PERCENT_INCREASE", "PERCENT_DECREASE"] as const;
export type OutputValueAdjustmentType = (typeof adjustmentTypes)[number];

export type RoundingDecimalPlaces = 0 | 1 | 2 | 3 | 4 | 5 | 6 | null;

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

export const outputFormats = ["CSV", "XLSX"] as const;
export type OutputProfileFormat = (typeof outputFormats)[number];

export const worksheetModes = ["COMBINE", "SEPARATE_WORKSHEETS", "SEPARATE_FILES"] as const;
export type OutputProfileWorksheetMode = (typeof worksheetModes)[number];

export const worksheetNameModes = ["SOURCE", "CUSTOM"] as const;
export type OutputProfileWorksheetNameMode = (typeof worksheetNameModes)[number];

export const csvDelimiters = ["COMMA", "SEMICOLON", "TAB", "PIPE"] as const;
export type OutputProfileCsvDelimiter = (typeof csvDelimiters)[number];

export type SourceWorksheetPreview = {
  id: string;
  projectId: string;
  sourceWorkbookImportId: string;
  workbookFileName: string;
  worksheetName: string;
  headers: string[];
  sampleRows: string[][];
  workbookWorksheets?: SourceWorkbookWorksheet[];
};

export type SourceWorkbookWorksheet = {
  id: string;
  name: string;
  position: number;
  headers: string[];
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
  sourceColumnIndex: number | null;
  sourceHeading: string;
  operator: OutputProfileFilterOperator;
  comparisonValue: string;
};

export type OutputProfileDraft = {
  id: string | null;
  name: string;
  filenameTemplate: string;
  outputFormat: OutputProfileFormat;
  csvDelimiter: OutputProfileCsvDelimiter;
  csvIncludeHeader: boolean;
  xlsxWorksheetName: string;
  worksheetMode?: OutputProfileWorksheetMode;
  worksheetNameMode?: OutputProfileWorksheetNameMode;
  worksheetNameMappings?: Record<string, string>;
  selectedWorksheetIds?: string[];
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  columns: OutputProfileColumnDraft[];
  filterMatchMode: OutputProfileFilterMatchMode;
  filters: OutputProfileFilterDraft[];
};

export type SaveOutputProfileInput = {
  projectId?: string;
  id?: string | null;
  name: string;
  filenameTemplate: string;
  outputFormat: OutputProfileFormat;
  csvDelimiter: OutputProfileCsvDelimiter;
  csvIncludeHeader: boolean;
  xlsxWorksheetName: string;
  worksheetMode?: OutputProfileWorksheetMode;
  worksheetNameMode?: OutputProfileWorksheetNameMode;
  worksheetNameMappings?: Record<string, string>;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  columns: Array<Omit<OutputProfileColumnDraft, "clientId">>;
  filterMatchMode: OutputProfileFilterMatchMode;
  filters: Array<Omit<OutputProfileFilterDraft, "clientId">>;
};

export type GenerateOutputProfileInput = SaveOutputProfileInput & {
  selectedWorksheetIds?: string[];
};

export type SaveOutputProfileResult =
  | { ok: true; profileId: string; message: string }
  | { ok: false; error: string };

export type OutputProfileMutationResult =
  | { ok: true; profileId: string; message: string }
  | { ok: false; error: string };

export type OutputProfileSummary = {
  id: string;
  name: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  outputFormat: OutputProfileFormat;
  outputColumnCount: number;
  updatedAt: string;
  originWorkbookFileName: string;
  originWorksheetName: string;
};

export type OutputProfileCompatibilityField = {
  key: string;
  expectedHeading: string;
  status: "MATCHED" | "MISSING" | "AMBIGUOUS" | "MANUAL";
  sourceColumnIndex: number | null;
  candidateSourceColumnIndexes: number[];
  outputColumnClientIds: string[];
  filterClientIds: string[];
};

export type AppliedOutputProfileContext = {
  profileId: string;
  profileName: string;
  originWorkbookFileName: string;
  originWorksheetName: string;
  requiredFieldCount: number;
  matchedFieldCount: number;
  fields: OutputProfileCompatibilityField[];
};
