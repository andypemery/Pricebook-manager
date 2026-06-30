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

export type SupportedWorkbookExtension = ".xlsx" | ".xls" | ".xlsm";

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
