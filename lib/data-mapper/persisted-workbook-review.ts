import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createWorksheetPreview } from "@/lib/data-mapper/excel-import";
import type { ValidationIssue, WorkbookSummary, WorkbookValidationResult, WorksheetPreview } from "@/lib/data-mapper/types";
import { loadSourceValidationState, ValidationIssueOverrideError } from "@/lib/data-mapper/validation-overrides";
import { sourceRowKey, type SourceRowReference } from "@/lib/data-mapper/source-row-exclusions";

export type PersistedWorkbookReview = {
  sourceWorkbookImportId: string;
  projectId: string;
  fileName: string;
  fileSizeBytes: number;
  preparedAt: string;
  summary: WorkbookSummary;
  validation: WorkbookValidationResult;
  worksheetPreviews: WorksheetPreview[];
  ignoredFingerprints: string[];
  rowReferences: SourceRowReference[];
  excludedRows: SourceRowReference[];
  reviewStateKey: string;
};

function serialisableIssue(issue: ValidationIssue): ValidationIssue {
  return {
    id: issue.id,
    fingerprint: issue.fingerprint,
    severity: issue.severity,
    category: issue.category,
    worksheetName: issue.worksheetName,
    rowNumber: issue.rowNumber,
    sku: issue.sku,
    field: issue.field,
    currentValue: issue.currentValue,
    message: issue.message
  };
}

export async function loadPersistedWorkbookReview(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  sourceWorkbookImportId: string
): Promise<PersistedWorkbookReview> {
  const state = await loadSourceValidationState(db, tenantId, sourceWorkbookImportId);
  if (state.source.projectId !== projectId) {
    throw new ValidationIssueOverrideError("The source workbook is not available.");
  }

  const rowReferences = new Map<string, SourceRowReference>();
  for (const issue of state.detectedIssues) {
    if (!issue.rowFingerprint) continue;
    const key = sourceRowKey(issue.worksheetName, issue.rowNumber);
    if (!rowReferences.has(key)) {
      rowReferences.set(key, {
        worksheetName: issue.worksheetName,
        physicalRowNumber: issue.rowNumber,
        rowFingerprint: issue.rowFingerprint
      });
    }
  }
  const ignoredFingerprints = state.detectedIssues
    .filter((issue) => issue.severity === "Error" && issue.ignored)
    .map((issue) => issue.fingerprint);
  const excludedRows = state.excludedRows.map((row) => ({
    worksheetName: row.worksheetName,
    physicalRowNumber: row.physicalRowNumber,
    rowFingerprint: row.rowFingerprint
  }));
  const reviewStateKey = createHash("sha256")
    .update(JSON.stringify({ ignoredFingerprints: [...ignoredFingerprints].sort(), excludedRows }))
    .digest("hex")
    .slice(0, 16);

  return {
    sourceWorkbookImportId: state.source.id,
    projectId: state.source.projectId,
    fileName: state.source.originalFileName,
    fileSizeBytes: state.source.fileSizeBytes,
    preparedAt: state.source.validatedAt.toISOString(),
    summary: state.summary,
    validation: {
      summary: state.validationSummary,
      issues: state.detectedIssues.map(serialisableIssue)
    },
    worksheetPreviews: state.summary.worksheets.map((worksheetSummary) => {
      const worksheet = state.workbook.getWorksheet(worksheetSummary.name);
      return worksheet
        ? createWorksheetPreview(worksheetSummary.name, worksheet, worksheetSummary)
        : {
            worksheetName: worksheetSummary.name,
            headers: worksheetSummary.headers,
            rows: [],
            headerRowNumber: worksheetSummary.detectedHeaderRow,
            sourceRowCount: worksheetSummary.rowCount,
            previewRowLimit: 100
          };
    }),
    ignoredFingerprints,
    rowReferences: [...rowReferences.values()],
    excludedRows,
    reviewStateKey
  };
}
