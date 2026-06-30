import type { DataMapperMetric, DataMapperPlaceholderPage, DataMapperProjectStatus } from "@/lib/data-mapper/types";

export const dashboardMetrics: DataMapperMetric[] = [
  { label: "Projects", value: "12", detail: "4 active this month" },
  { label: "Current workbook", value: "June pricebook", detail: "Awaiting validation" },
  { label: "Worksheets", value: "18", detail: "Products, partners and regional pricing" },
  { label: "Total rows", value: "148,260", detail: "Placeholder volume across all worksheets" }
];

export const validationSummary = [
  { label: "Ready", value: "142,910", tone: "success" },
  { label: "Warnings", value: "4,836", tone: "warning" },
  { label: "Blocked", value: "514", tone: "danger" }
] as const;

export const recentProjects: { name: string; owner: string; status: DataMapperProjectStatus; updated: string }[] = [
  { name: "June UK pricebook", owner: "Commercial operations", status: "Awaiting validation", updated: "Today" },
  { name: "May approved export", owner: "Revenue operations", status: "Approved", updated: "29 Jun 2026" },
  { name: "Partner catalogue pilot", owner: "Channel team", status: "Draft", updated: "27 Jun 2026" }
];

export const recentImports = [
  { fileName: "master-pricebook-june.xlsx", worksheets: "18 worksheets", rows: "148,260 rows", status: "Parsed placeholder" },
  { fileName: "partner-discounts-emea.xlsx", worksheets: "6 worksheets", rows: "24,810 rows", status: "Queued" },
  { fileName: "legacy-products-review.xlsx", worksheets: "9 worksheets", rows: "62,144 rows", status: "Needs template" }
] as const;

export const latestGeneratedFiles = [
  { name: "CRM product upload", target: "CRM", status: "Waiting for approval" },
  { name: "SAP pricing conditions", target: "SAP", status: "Draft output" },
  { name: "ERP product list", target: "ERP", status: "Template mapped" }
] as const;

export const dataMapperPages: Record<string, DataMapperPlaceholderPage> = {
  projects: {
    eyebrow: "Project workspace",
    title: "Projects",
    summary: "Manage monthly pricebook workspaces, ownership, status and approval progress.",
    capabilities: ["Project list and status tracking", "Owner and due-date metadata", "Import history by project"],
    nextSteps: ["Add persistent project records", "Connect project permissions", "Add archive and restore controls"]
  },
  workbook: {
    eyebrow: "Workbook intake",
    title: "Workbook",
    summary: "Review uploaded master workbook structure before parsing real spreadsheet content.",
    capabilities: ["Workbook metadata", "Worksheet inventory", "Upload staging panel"],
    nextSteps: ["Connect Excel import engine", "Store workbook file metadata", "Add worksheet preview"]
  },
  mapping: {
    eyebrow: "Header mapping",
    title: "Mapping",
    summary: "Prepare reusable source-to-target mappings for CRM, SAP and ERP export formats.",
    capabilities: ["Source header catalogue", "Target field definitions", "Mapping template selection"],
    nextSteps: ["Persist mapping templates", "Add drag-and-drop field mapping", "Validate required target fields"]
  },
  validation: {
    eyebrow: "Data quality",
    title: "Validation",
    summary: "Surface import warnings, blocking errors and duplicate SKU findings before generation.",
    capabilities: ["Validation summary", "Duplicate SKU queue", "Exception review workflow"],
    nextSteps: ["Implement validation rules", "Connect duplicate detector", "Add row-level exception review"]
  },
  comparison: {
    eyebrow: "Month-on-month review",
    title: "Comparison",
    summary: "Highlight price changes, new products and removed products against the prior upload.",
    capabilities: ["Price movement summary", "New and removed product counts", "Partner-level deltas"],
    nextSteps: ["Load prior approved upload", "Implement comparison engine", "Add change approval filters"]
  },
  templates: {
    eyebrow: "Reusable configuration",
    title: "Templates",
    summary: "Save repeatable mapping, validation and export configurations for recurring pricebook cycles.",
    capabilities: ["Template library", "Target system profiles", "Calculated column placeholders"],
    nextSteps: ["Persist template versions", "Add template duplication", "Introduce calculated column builder"]
  },
  generate: {
    eyebrow: "Controlled outputs",
    title: "Generate",
    summary: "Prepare final export packages only after validation and approval gates are complete.",
    capabilities: ["Export file queue", "Approval state", "Target system output list"],
    nextSteps: ["Implement export engine", "Add approval checks", "Record generated file register entries"]
  }
};
