export type DataMapperEngineStatus = "planned" | "placeholder" | "ready";

export type DataMapperEngineKey =
  | "excelImport"
  | "workbookParser"
  | "validation"
  | "duplicateSku"
  | "mapping"
  | "formula"
  | "comparison"
  | "template"
  | "export"
  | "approval";

export type DataMapperEngineDefinition = {
  key: DataMapperEngineKey;
  name: string;
  purpose: string;
  status: DataMapperEngineStatus;
};

export type DataMapperProjectStatus = "Draft" | "Awaiting validation" | "Ready for approval" | "Approved";

export type DataMapperMetric = {
  label: string;
  value: string;
  detail: string;
};

export type DataMapperPlaceholderPage = {
  title: string;
  eyebrow: string;
  summary: string;
  capabilities: string[];
  nextSteps: string[];
};

export type SupportedWorkbookExtension = ".xlsx" | ".xlsm";

export type WorksheetImportStatus = "Ready" | "Empty worksheet" | "Missing headers";

export type HeaderDetectionResult = {
  rowNumber: number | null;
  headers: string[];
  confidence: "high" | "medium" | "low" | "none";
  message: string | null;
};

export type WorksheetSummary = {
  name: string;
  rowCount: number;
  columnCount: number;
  detectedHeaderRow: number | null;
  headers: string[];
  importStatus: WorksheetImportStatus;
  message: string | null;
};

export type WorkbookSummary = {
  workbookName: string;
  worksheetCount: number;
  totalRows: number;
  totalColumns: number;
  worksheets: WorksheetSummary[];
};

export type UploadedWorkbookDetails = {
  fileName: string;
  fileSize: number;
  uploadedAt: string;
};

export type WorksheetPreview = {
  worksheetName: string;
  headers: string[];
  rows: string[][];
  sourceRowCount: number;
  previewRowLimit: number;
};

export type ValidationSeverity = "Error" | "Warning";

export type ValidationIssueCategory =
  | "duplicate-sku"
  | "missing-required-field"
  | "price"
  | "margin"
  | "approval-status";

export type ValidationIssue = {
  id: string;
  severity: ValidationSeverity;
  category: ValidationIssueCategory;
  worksheetName: string;
  rowNumber: number;
  sku: string | null;
  field: string;
  message: string;
};

export type ValidationSummary = {
  totalRowsChecked: number;
  totalErrors: number;
  totalWarnings: number;
  worksheetsWithIssues: number;
  duplicateSkuCount: number;
  missingRequiredFieldCount: number;
  priceIssueCount: number;
  marginIssueCount: number;
};

export type WorkbookValidationResult = {
  summary: ValidationSummary;
  issues: ValidationIssue[];
};
