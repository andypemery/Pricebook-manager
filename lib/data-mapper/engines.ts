import type { DataMapperEngineDefinition } from "@/lib/data-mapper/types";

export const dataMapperEngines: DataMapperEngineDefinition[] = [
  {
    key: "excelImport",
    name: "Excel import engine",
    purpose: "Accept uploaded master workbooks and hand workbook streams to the parser.",
    status: "ready"
  },
  {
    key: "workbookParser",
    name: "Workbook parser",
    purpose: "Read workbook tabs, normalise worksheet metadata and prepare row batches.",
    status: "ready"
  },
  {
    key: "validation",
    name: "Validation engine",
    purpose: "Apply required-field, data type and business-rule validation to imported rows.",
    status: "ready"
  },
  {
    key: "duplicateSku",
    name: "Duplicate SKU detector",
    purpose: "Identify repeated SKUs and route exceptions into validation review.",
    status: "placeholder"
  },
  {
    key: "mapping",
    name: "Mapping engine",
    purpose: "Map source workbook headers into target export schemas.",
    status: "placeholder"
  },
  {
    key: "formula",
    name: "Formula engine",
    purpose: "Evaluate approved calculated columns without processing workbook content yet.",
    status: "placeholder"
  },
  {
    key: "comparison",
    name: "Comparison engine",
    purpose: "Compare new uploads with prior periods to identify product and price movement.",
    status: "placeholder"
  },
  {
    key: "template",
    name: "Template engine",
    purpose: "Store reusable mapping and export templates for repeat monthly workflows.",
    status: "placeholder"
  },
  {
    key: "export",
    name: "Export engine",
    purpose: "Prepare generated Excel outputs for downstream CRM, SAP and ERP uploads.",
    status: "placeholder"
  },
  {
    key: "approval",
    name: "Approval engine",
    purpose: "Coordinate review and approval before final files are generated.",
    status: "placeholder"
  }
];

export function getDataMapperEngine(name: DataMapperEngineDefinition["key"]) {
  return dataMapperEngines.find((engine) => engine.key === name);
}
