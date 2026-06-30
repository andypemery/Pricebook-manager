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
