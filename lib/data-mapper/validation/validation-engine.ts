import type ExcelJS from "exceljs";
import type {
  ValidationIssue,
  ValidationIssueCategory,
  ValidationSeverity,
  WorkbookSummary,
  WorkbookValidationResult,
  WorksheetSummary
} from "@/lib/data-mapper/types";

export type ValidationRuleConfig = {
  minimumMarginPercentage: number;
  allowedApprovalStatuses: string[];
};

const defaultConfig: ValidationRuleConfig = {
  minimumMarginPercentage: 20,
  allowedApprovalStatuses: ["approved", "pending", "draft", "rejected", "awaiting approval"]
};

const headerAliases = {
  sku: ["sku", "product sku", "item sku", "part number", "product code"],
  description: ["item description", "description", "product description", "item name", "product name"],
  costPrice: ["cost price", "cost", "unit cost", "buy price", "purchase price"],
  sellPrice: ["sell price", "selling price", "sale price", "unit sell", "list price"],
  marginPercentage: ["margin percentage", "margin %", "margin", "gross margin"],
  framework: ["framework", "contract framework", "framework name"],
  partner: ["partner", "supplier", "vendor", "partner name"],
  approvalStatus: ["approval status", "status", "approved status"]
} as const;

type HeaderKey = keyof typeof headerAliases;
type HeaderMap = Partial<Record<HeaderKey, number>>;

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildHeaderMap(headers: readonly string[]): HeaderMap {
  const normalisedHeaders = headers.map(normaliseHeader);
  const headerMap: HeaderMap = {};
  for (const field of Object.keys(headerAliases) as HeaderKey[]) {
    const aliases: readonly string[] = headerAliases[field];
    const index = normalisedHeaders.findIndex((header) => aliases.includes(header));
    if (index !== -1) headerMap[field] = index;
  }
  return headerMap;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    return "";
  }
  return String(value).trim();
}

function rowValue(row: ExcelJS.Row, columnIndex: number | undefined) {
  if (columnIndex === undefined) return "";
  return cellText(row.getCell(columnIndex + 1).value);
}

function numberValue(value: string): number | null {
  const cleaned = value.replace(/[%£$,]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function marginPercentage(costPrice: number | null, sellPrice: number | null, explicitMargin: number | null) {
  if (explicitMargin !== null) return explicitMargin;
  if (costPrice === null || sellPrice === null || sellPrice === 0) return null;
  return ((sellPrice - costPrice) / sellPrice) * 100;
}

function issue(
  params: {
    category: ValidationIssueCategory;
    severity: ValidationSeverity;
    worksheetName: string;
    rowNumber: number;
    sku: string | null;
    field: string;
    message: string;
  },
  index: number
): ValidationIssue {
  return {
    id: `${params.worksheetName}-${params.rowNumber}-${params.field}-${index}`,
    ...params
  };
}

function validateWorksheet(
  worksheet: ExcelJS.Worksheet,
  summary: WorksheetSummary,
  seenSkus: Map<string, { worksheetName: string; rowNumber: number }>,
  config: ValidationRuleConfig
) {
  const issues: ValidationIssue[] = [];
  if (summary.detectedHeaderRow === null) return { rowsChecked: 0, issues };

  const headerMap = buildHeaderMap(summary.headers);
  const firstDataRow = summary.detectedHeaderRow + 1;
  let rowsChecked = 0;

  for (let rowNumber = firstDataRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowHasData = Array.from({ length: summary.columnCount }, (_, index) => cellText(row.getCell(index + 1).value)).some(Boolean);
    if (!rowHasData) continue;

    rowsChecked += 1;
    const sku = rowValue(row, headerMap.sku);
    const description = rowValue(row, headerMap.description);
    const costPriceText = rowValue(row, headerMap.costPrice);
    const sellPriceText = rowValue(row, headerMap.sellPrice);
    const framework = rowValue(row, headerMap.framework);
    const partner = rowValue(row, headerMap.partner);
    const approvalStatus = rowValue(row, headerMap.approvalStatus);
    const explicitMarginText = rowValue(row, headerMap.marginPercentage);
    const costPrice = numberValue(costPriceText);
    const sellPrice = numberValue(sellPriceText);
    const explicitMargin = explicitMarginText ? numberValue(explicitMarginText) : null;
    const margin = marginPercentage(costPrice, sellPrice, explicitMargin);
    const base = { worksheetName: summary.name, rowNumber, sku: sku || null };
    const nextIndex = () => issues.length + 1;

    if (!sku) {
      issues.push(issue({ ...base, category: "missing-required-field", severity: "Error", field: "SKU", message: "SKU is required." }, nextIndex()));
    } else {
      const normalisedSku = sku.toLowerCase();
      const existing = seenSkus.get(normalisedSku);
      if (existing) {
        issues.push(issue({ ...base, category: "duplicate-sku", severity: "Error", field: "SKU", message: `Duplicate SKU also appears on ${existing.worksheetName} row ${existing.rowNumber}.` }, nextIndex()));
      } else {
        seenSkus.set(normalisedSku, { worksheetName: summary.name, rowNumber });
      }
    }

    if (!description) issues.push(issue({ ...base, category: "missing-required-field", severity: "Error", field: "Item description", message: "Item description is required." }, nextIndex()));
    if (!costPriceText) issues.push(issue({ ...base, category: "missing-required-field", severity: "Error", field: "Cost price", message: "Cost price is required." }, nextIndex()));
    if (!sellPriceText) issues.push(issue({ ...base, category: "missing-required-field", severity: "Error", field: "Sell price", message: "Sell price is required." }, nextIndex()));
    if (!framework) issues.push(issue({ ...base, category: "missing-required-field", severity: "Error", field: "Framework", message: "Framework is required." }, nextIndex()));
    if (!partner) issues.push(issue({ ...base, category: "missing-required-field", severity: "Error", field: "Partner", message: "Partner is required." }, nextIndex()));

    if (costPriceText && costPrice === null) issues.push(issue({ ...base, category: "price", severity: "Error", field: "Cost price", message: "Cost price must be a valid number." }, nextIndex()));
    if (sellPriceText && sellPrice === null) issues.push(issue({ ...base, category: "price", severity: "Error", field: "Sell price", message: "Sell price must be a valid number." }, nextIndex()));
    if (costPrice !== null && costPrice < 0) issues.push(issue({ ...base, category: "price", severity: "Error", field: "Cost price", message: "Cost price cannot be negative." }, nextIndex()));
    if (sellPrice !== null && sellPrice === 0) issues.push(issue({ ...base, category: "price", severity: "Error", field: "Sell price", message: "Sell price cannot be zero." }, nextIndex()));
    if (sellPrice !== null && sellPrice < 0) issues.push(issue({ ...base, category: "price", severity: "Error", field: "Sell price", message: "Sell price cannot be negative." }, nextIndex()));

    if (explicitMarginText && explicitMargin === null) issues.push(issue({ ...base, category: "margin", severity: "Error", field: "Margin percentage", message: "Margin percentage must be a valid number." }, nextIndex()));
    if (margin !== null && margin < config.minimumMarginPercentage) {
      issues.push(issue({ ...base, category: "margin", severity: "Warning", field: "Margin percentage", message: `Margin is below the ${config.minimumMarginPercentage}% threshold.` }, nextIndex()));
    }

    if (approvalStatus && !config.allowedApprovalStatuses.includes(approvalStatus.toLowerCase())) {
      issues.push(issue({ ...base, category: "approval-status", severity: "Error", field: "Approval status", message: "Approval status is not recognised." }, nextIndex()));
    }
  }

  return { rowsChecked, issues };
}

export function validateWorkbook(
  workbook: ExcelJS.Workbook,
  summary: WorkbookSummary,
  config: ValidationRuleConfig = defaultConfig
): WorkbookValidationResult {
  const seenSkus = new Map<string, { worksheetName: string; rowNumber: number }>();
  const worksheetResults = summary.worksheets.map((worksheetSummary) => {
    const worksheet = workbook.getWorksheet(worksheetSummary.name);
    return worksheet ? validateWorksheet(worksheet, worksheetSummary, seenSkus, config) : { rowsChecked: 0, issues: [] };
  });
  const issues = worksheetResults.flatMap((result) => result.issues);
  const worksheetsWithIssues = new Set(issues.map((validationIssue) => validationIssue.worksheetName)).size;

  return {
    summary: {
      totalRowsChecked: worksheetResults.reduce((total, result) => total + result.rowsChecked, 0),
      totalErrors: issues.filter((validationIssue) => validationIssue.severity === "Error").length,
      totalWarnings: issues.filter((validationIssue) => validationIssue.severity === "Warning").length,
      worksheetsWithIssues,
      duplicateSkuCount: issues.filter((validationIssue) => validationIssue.category === "duplicate-sku").length,
      missingRequiredFieldCount: issues.filter((validationIssue) => validationIssue.category === "missing-required-field").length,
      priceIssueCount: issues.filter((validationIssue) => validationIssue.category === "price").length,
      marginIssueCount: issues.filter((validationIssue) => validationIssue.category === "margin").length
    },
    issues
  };
}
