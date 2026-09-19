import type { ValidationIssue, ValidationIssueCategory, ValidationSeverity } from "@/lib/data-mapper/types";
import { sourceRowKey } from "@/lib/data-mapper/source-row-exclusions";

export type PreviewValidationIssue = ValidationIssue & { ignored: boolean };

export type PreviewValidationFilters = {
  worksheet?: "All worksheets" | string;
  severity: "All" | ValidationSeverity;
  category: "All" | ValidationIssueCategory;
};

export type PreviewValidationRow = {
  key: string;
  worksheetName: string;
  rowNumber: number;
  issues: PreviewValidationIssue[];
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
  return (!filters.worksheet || filters.worksheet === "All worksheets" || issue.worksheetName === filters.worksheet)
    && (filters.severity === "All" || issue.severity === filters.severity)
    && (filters.category === "All" || issue.category === filters.category);
}

export function validationRowsForFilters(
  issues: readonly ValidationIssue[],
  ignoredFingerprints: ReadonlySet<string>,
  excludedRowKeys: ReadonlySet<string>,
  filters: PreviewValidationFilters,
  searchTerm = ""
) {
  const normalisedSearch = searchTerm.trim().toLocaleLowerCase("en-GB");
  const grouped = new Map<string, PreviewValidationRow>();
  for (const issue of issues) {
    const key = sourceRowKey(issue.worksheetName, issue.rowNumber);
    if (excludedRowKeys.has(key)) continue;
    const previewIssue = { ...issue, ignored: issue.severity === "Error" && ignoredFingerprints.has(issue.fingerprint) };
    if (!issueMatchesPreviewFilters(previewIssue, filters)) continue;
    if (normalisedSearch && ![
      issue.worksheetName,
      String(issue.rowNumber),
      issue.field,
      issue.currentValue ?? "",
      issue.message
    ].some((value) => value.toLocaleLowerCase("en-GB").includes(normalisedSearch))) continue;
    const row = grouped.get(key) ?? { key, worksheetName: issue.worksheetName, rowNumber: issue.rowNumber, issues: [] };
    row.issues.push(previewIssue);
    grouped.set(key, row);
  }
  return [...grouped.values()];
}

export function visibleRowSelectionState(selectedRowKeys: ReadonlySet<string>, visibleRowKeys: readonly string[]) {
  const selectedVisibleCount = visibleRowKeys.filter((key) => selectedRowKeys.has(key)).length;
  return {
    checked: visibleRowKeys.length > 0 && selectedVisibleCount === visibleRowKeys.length,
    indeterminate: selectedVisibleCount > 0 && selectedVisibleCount < visibleRowKeys.length,
    selectedVisibleCount
  };
}

export function updateVisibleRowSelection(selectedRowKeys: ReadonlySet<string>, visibleRowKeys: readonly string[], checked: boolean) {
  const next = new Set(selectedRowKeys);
  for (const key of visibleRowKeys) checked ? next.add(key) : next.delete(key);
  return next;
}

export function validationActionScope(rows: readonly PreviewValidationRow[], selectedRowKeys: ReadonlySet<string>) {
  const visibleUnresolved = new Set<string>();
  const visibleIgnored = new Set<string>();
  const selectedUnresolved = new Set<string>();
  const selectedIgnored = new Set<string>();

  for (const row of rows) {
    const selected = selectedRowKeys.has(row.key);
    for (const issue of row.issues) {
      if (issue.severity !== "Error") continue;
      const visibleTarget = issue.ignored ? visibleIgnored : visibleUnresolved;
      visibleTarget.add(issue.fingerprint);
      if (selected) (issue.ignored ? selectedIgnored : selectedUnresolved).add(issue.fingerprint);
    }
  }

  return {
    visibleUnresolvedErrorFingerprints: [...visibleUnresolved],
    visibleIgnoredErrorFingerprints: [...visibleIgnored],
    selectedUnresolvedErrorFingerprints: [...selectedUnresolved],
    selectedIgnoredErrorFingerprints: [...selectedIgnored]
  };
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
