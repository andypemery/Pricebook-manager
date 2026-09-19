import type { PrismaClient } from "@prisma/client";
import { readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import { getSourceWorkbookStorage } from "@/lib/data-mapper/source-workbook-storage";
import {
  parseSourceRowReferences,
  sourceRowKey,
  sourceRowReferenceFromWorksheet,
  sourceRowReferenceMatches,
  type SourceRowReference
} from "@/lib/data-mapper/source-row-exclusions";

export class SourceWorkbookUnavailableError extends Error {}
export class ValidationIssueOverrideError extends Error {}
export class SourceRowExclusionError extends Error {}

export type SourceValidationState = Awaited<ReturnType<typeof loadSourceValidationState>>;

export async function loadSourceValidationState(db: PrismaClient, tenantId: string, sourceWorkbookImportId: string) {
  const source = await db.sourceWorkbookImport.findFirst({
    where: { id: sourceWorkbookImportId, tenantId, project: { tenantId } },
    select: {
      id: true,
      projectId: true,
      originalFileName: true,
      fileSizeBytes: true,
      validatedAt: true,
      fileReference: { select: { storageKey: true, fileType: true } },
      worksheets: { orderBy: { position: "asc" }, select: { id: true, name: true, columnCount: true } }
    }
  });
  if (!source) throw new ValidationIssueOverrideError("The source workbook is not available.");
  if (!source.fileReference) throw new SourceWorkbookUnavailableError("Source file needs to be re-uploaded before an output file can be generated.");
  const bytes = await getSourceWorkbookStorage().get(source.fileReference.storageKey);
  if (!bytes) throw new SourceWorkbookUnavailableError("Source file needs to be re-uploaded before an output file can be generated.");
  const file = new File([bytes], source.originalFileName, { type: source.fileReference.fileType });
  const { workbook, summary } = await readWorkbook(file);
  const validation = validateWorkbook(workbook, summary);
  const blockingFingerprints = validation.issues.filter((issue) => issue.severity === "Error").map((issue) => issue.fingerprint);
  const [overrides, storedExclusions] = await Promise.all([
    blockingFingerprints.length === 0 ? Promise.resolve([]) : db.validationIssueOverride.findMany({
      where: { tenantId, sourceWorkbookImportId, issueFingerprint: { in: blockingFingerprints } },
      select: { issueFingerprint: true, ignoredAt: true, ignoredById: true }
    }),
    db.sourceWorkbookRowExclusion.findMany({
      where: { tenantId, sourceWorkbookImportId },
      orderBy: [{ sourceWorksheet: { position: "asc" } }, { physicalRowNumber: "asc" }],
      select: {
        id: true,
        sourceWorksheetId: true,
        physicalRowNumber: true,
        rowFingerprint: true,
        excludedAt: true,
        excludedById: true,
        sourceWorksheet: { select: { name: true, columnCount: true } }
      }
    })
  ]);
  const ignored = new Set(overrides.map((override) => override.issueFingerprint));
  const currentRowReferences = new Map<string, SourceRowReference>();
  const detectedIssues = validation.issues.map((issue) => {
    const key = sourceRowKey(issue.worksheetName, issue.rowNumber);
    let reference = currentRowReferences.get(key);
    if (!reference) {
      const worksheetMetadata = source.worksheets.find((worksheet) => worksheet.name === issue.worksheetName);
      const worksheet = workbook.getWorksheet(issue.worksheetName);
      reference = worksheetMetadata && worksheet
        ? sourceRowReferenceFromWorksheet(worksheet, issue.worksheetName, issue.rowNumber, worksheetMetadata.columnCount) ?? undefined
        : undefined;
      if (reference) currentRowReferences.set(key, reference);
    }
    return {
      ...issue,
      ignored: issue.severity === "Error" && ignored.has(issue.fingerprint),
      rowFingerprint: reference?.rowFingerprint ?? ""
    };
  });
  const validExclusions = storedExclusions.flatMap((exclusion) => {
    const worksheet = workbook.getWorksheet(exclusion.sourceWorksheet.name);
    if (!worksheet) return [];
    const current = sourceRowReferenceFromWorksheet(
      worksheet,
      exclusion.sourceWorksheet.name,
      exclusion.physicalRowNumber,
      exclusion.sourceWorksheet.columnCount
    );
    const stored = {
      worksheetName: exclusion.sourceWorksheet.name,
      physicalRowNumber: exclusion.physicalRowNumber,
      rowFingerprint: exclusion.rowFingerprint
    };
    return current && sourceRowReferenceMatches(current, stored) ? [{ ...exclusion, ...stored }] : [];
  });
  const excludedRowKeys = new Set(validExclusions.map((exclusion) => sourceRowKey(exclusion.worksheetName, exclusion.physicalRowNumber)));
  const issues = detectedIssues.filter((issue) => !excludedRowKeys.has(sourceRowKey(issue.worksheetName, issue.rowNumber)));
  const blockingCount = issues.filter((issue) => issue.severity === "Error").length;
  const ignoredBlockingCount = issues.filter((issue) => issue.severity === "Error" && issue.ignored).length;
  const activeWarningCount = issues.filter((issue) => issue.severity === "Warning").length;
  const excludedRows = validExclusions.map((exclusion) => ({
    id: exclusion.id,
    sourceWorksheetId: exclusion.sourceWorksheetId,
    worksheetName: exclusion.worksheetName,
    physicalRowNumber: exclusion.physicalRowNumber,
    rowFingerprint: exclusion.rowFingerprint,
    excludedAt: exclusion.excludedAt.toISOString(),
    excludedById: exclusion.excludedById,
    issues: detectedIssues.filter((issue) => issue.worksheetName === exclusion.worksheetName && issue.rowNumber === exclusion.physicalRowNumber)
  }));
  return {
    source,
    workbook,
    summary,
    issues,
    detectedIssues,
    excludedRows,
    excludedRowKeys,
    validationSummary: validation.summary,
    blockingCount,
    ignoredBlockingCount,
    unresolvedBlockingCount: blockingCount - ignoredBlockingCount,
    totalErrorCount: validation.summary.totalErrors,
    totalWarningCount: validation.summary.totalWarnings,
    activeErrorCount: blockingCount,
    activeWarningCount,
    excludedRowCount: excludedRows.length
  };
}

export async function changeValidationIssueOverrides(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  sourceWorkbookImportId: string,
  fingerprints: readonly string[],
  action: "IGNORE" | "RESTORE"
) {
  const state = await loadSourceValidationState(db, actor.tenantId, sourceWorkbookImportId);
  const allowed = new Set(state.detectedIssues.filter((issue) => issue.severity === "Error").map((issue) => issue.fingerprint));
  const requested = [...new Set(fingerprints.filter((fingerprint) => typeof fingerprint === "string" && fingerprint.length <= 64))];
  if (requested.length === 0) throw new ValidationIssueOverrideError("Select at least one blocking validation issue.");
  if (requested.some((fingerprint) => !allowed.has(fingerprint))) throw new ValidationIssueOverrideError("One or more selected validation issues do not belong to this current source workbook.");
  if (action === "IGNORE") {
    await db.$transaction(requested.map((issueFingerprint) => db.validationIssueOverride.upsert({
      where: { sourceWorkbookImportId_issueFingerprint: { sourceWorkbookImportId, issueFingerprint } },
      update: { ignoredById: actor.id, ignoredAt: new Date() },
      create: { tenantId: actor.tenantId, sourceWorkbookImportId, issueFingerprint, ignoredById: actor.id }
    })));
  } else {
    await db.validationIssueOverride.deleteMany({ where: { tenantId: actor.tenantId, sourceWorkbookImportId, issueFingerprint: { in: requested } } });
  }
  return loadSourceValidationState(db, actor.tenantId, sourceWorkbookImportId);
}

export async function changeSourceRowExclusions(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  sourceWorkbookImportId: string,
  rows: readonly SourceRowReference[],
  action: "EXCLUDE" | "RESTORE"
) {
  const requested = parseSourceRowReferences(rows);
  if (requested.length === 0) throw new SourceRowExclusionError("Select at least one validation row.");
  if (!Array.isArray(rows) || rows.some((row) => parseSourceRowReferences([row]).length !== 1)) {
    throw new SourceRowExclusionError("One or more selected rows are not valid.");
  }
  const state = await loadSourceValidationState(db, actor.tenantId, sourceWorkbookImportId);
  const worksheetIds = new Map(state.source.worksheets.map((worksheet) => [worksheet.name, worksheet.id]));
  const allowed = new Map<string, SourceRowReference>();
  const candidateIssues = action === "EXCLUDE" ? state.detectedIssues : state.excludedRows.flatMap((row) => row.issues);
  for (const issue of candidateIssues) {
    const key = sourceRowKey(issue.worksheetName, issue.rowNumber);
    if (allowed.has(key)) continue;
    const reference = issue.rowFingerprint ? {
      worksheetName: issue.worksheetName,
      physicalRowNumber: issue.rowNumber,
      rowFingerprint: issue.rowFingerprint
    } : null;
    if (reference) allowed.set(key, reference);
  }
  if (action === "RESTORE") {
    for (const row of state.excludedRows) {
      allowed.set(sourceRowKey(row.worksheetName, row.physicalRowNumber), {
        worksheetName: row.worksheetName,
        physicalRowNumber: row.physicalRowNumber,
        rowFingerprint: row.rowFingerprint
      });
    }
  }
  if (requested.some((row) => {
    const current = allowed.get(sourceRowKey(row.worksheetName, row.physicalRowNumber));
    return !current || !sourceRowReferenceMatches(current, row) || !worksheetIds.has(row.worksheetName);
  })) {
    throw new SourceRowExclusionError("One or more selected rows do not belong to this current source workbook.");
  }

  const keys = requested.map((row) => ({
    sourceWorksheetId: worksheetIds.get(row.worksheetName)!,
    physicalRowNumber: row.physicalRowNumber
  }));
  if (action === "EXCLUDE") {
    await db.$transaction(async (transaction) => {
      await transaction.sourceWorkbookRowExclusion.deleteMany({
        where: { tenantId: actor.tenantId, sourceWorkbookImportId, OR: keys }
      });
      await transaction.sourceWorkbookRowExclusion.createMany({
        data: requested.map((row) => ({
          tenantId: actor.tenantId,
          sourceWorkbookImportId,
          sourceWorksheetId: worksheetIds.get(row.worksheetName)!,
          physicalRowNumber: row.physicalRowNumber,
          rowFingerprint: row.rowFingerprint,
          excludedById: actor.id
        }))
      });
    });
  } else {
    await db.sourceWorkbookRowExclusion.deleteMany({
      where: { tenantId: actor.tenantId, sourceWorkbookImportId, OR: keys }
    });
  }
  return { changedCount: requested.length, worksheetNames: [...new Set(requested.map((row) => row.worksheetName))], projectId: state.source.projectId };
}
