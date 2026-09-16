import type { ValidationIssue, ValidationIssueCategory, ValidationSeverity } from "@/lib/data-mapper/types";

export type PreviewValidationIssue = ValidationIssue & { ignored: boolean };

export type PreviewValidationFilters = {
  severity: "All" | ValidationSeverity;
  category: "All" | ValidationIssueCategory;
};

export function validationIssuesForWorksheet(
  issues: readonly ValidationIssue[],
  worksheetName: string,
  ignoredFingerprints: ReadonlySet<string>
) {
  return issues
    .filter((issue) => issue.worksheetName === worksheetName)
    .map((issue) => ({ ...issue, ignored: issue.severity === "Error" && ignoredFingerprints.has(issue.fingerprint) }));
}

export function issueMatchesPreviewFilters(issue: PreviewValidationIssue, filters: PreviewValidationFilters) {
  return (filters.severity === "All" || issue.severity === filters.severity)
    && (filters.category === "All" || issue.category === filters.category);
}

export function groupValidationIssuesByRow(issues: readonly PreviewValidationIssue[]) {
  const grouped = new Map<number, PreviewValidationIssue[]>();
  for (const issue of issues) {
    const rowIssues = grouped.get(issue.rowNumber) ?? [];
    rowIssues.push(issue);
    grouped.set(issue.rowNumber, rowIssues);
  }
  return grouped;
}

export function sourceCellValidationState(issues: readonly PreviewValidationIssue[], heading: string) {
  const normalisedHeading = heading.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
  const aliases: Record<string, string[]> = {
    sku: ["sku", "product sku", "item sku", "part number", "product code"],
    "item description": ["item description", "description", "product description", "item name", "product name"],
    "cost price": ["cost price", "cost", "unit cost", "buy price", "purchase price"],
    "sell price": ["sell price", "selling price", "sale price", "unit sell", "list price"],
    "margin percentage": ["margin percentage", "margin %", "margin", "gross margin"],
    framework: ["framework", "contract framework", "framework name"],
    partner: ["partner", "supplier", "vendor", "partner name"],
    "approval status": ["approval status", "status", "approved status"]
  };
  const matching = issues.filter((issue) => {
    const field = issue.field.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
    return (aliases[field] ?? [field]).includes(normalisedHeading);
  });
  if (matching.some((issue) => issue.severity === "Error" && !issue.ignored)) return "error";
  if (matching.some((issue) => issue.severity === "Error" && issue.ignored)) return "ignored-error";
  if (matching.some((issue) => issue.severity === "Warning")) return "warning";
  return "normal";
}

export function rowSeverityLabel(issues: readonly PreviewValidationIssue[]) {
  const unresolvedErrors = issues.filter((issue) => issue.severity === "Error" && !issue.ignored).length;
  const ignoredErrors = issues.filter((issue) => issue.severity === "Error" && issue.ignored).length;
  const warnings = issues.filter((issue) => issue.severity === "Warning").length;
  const count = issues.length;
  if (unresolvedErrors > 0) return `Error${count > 1 ? ` · ${count} issues` : ""}`;
  if (ignoredErrors > 0) return `Ignored error${count > 1 ? ` · ${count} issues` : ""}`;
  if (warnings > 0) return `Warning${count > 1 ? ` · ${count} issues` : ""}`;
  return "—";
}
