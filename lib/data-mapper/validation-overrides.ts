import type { PrismaClient } from "@prisma/client";
import { readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import { getSourceWorkbookStorage } from "@/lib/data-mapper/source-workbook-storage";

export class SourceWorkbookUnavailableError extends Error {}
export class ValidationIssueOverrideError extends Error {}

export type SourceValidationState = Awaited<ReturnType<typeof loadSourceValidationState>>;

export async function loadSourceValidationState(db: PrismaClient, tenantId: string, sourceWorkbookImportId: string) {
  const source = await db.sourceWorkbookImport.findFirst({
    where: { id: sourceWorkbookImportId, tenantId },
    select: { id: true, originalFileName: true, fileReference: { select: { storageKey: true, fileType: true } } }
  });
  if (!source) throw new ValidationIssueOverrideError("The source workbook is not available.");
  if (!source.fileReference) throw new SourceWorkbookUnavailableError("Source file needs to be re-uploaded before an output file can be generated.");
  const bytes = await getSourceWorkbookStorage().get(source.fileReference.storageKey);
  if (!bytes) throw new SourceWorkbookUnavailableError("Source file needs to be re-uploaded before an output file can be generated.");
  const file = new File([bytes], source.originalFileName, { type: source.fileReference.fileType });
  const { workbook, summary } = await readWorkbook(file);
  const validation = validateWorkbook(workbook, summary);
  const blockingFingerprints = validation.issues.filter((issue) => issue.severity === "Error").map((issue) => issue.fingerprint);
  const overrides = blockingFingerprints.length === 0 ? [] : await db.validationIssueOverride.findMany({
    where: { tenantId, sourceWorkbookImportId, issueFingerprint: { in: blockingFingerprints } },
    select: { issueFingerprint: true, ignoredAt: true, ignoredById: true }
  });
  const ignored = new Set(overrides.map((override) => override.issueFingerprint));
  const issues = validation.issues.map((issue) => ({ ...issue, ignored: issue.severity === "Error" && ignored.has(issue.fingerprint) }));
  const blockingCount = issues.filter((issue) => issue.severity === "Error").length;
  const ignoredBlockingCount = issues.filter((issue) => issue.severity === "Error" && issue.ignored).length;
  return {
    source,
    workbook,
    summary,
    issues,
    validationSummary: validation.summary,
    blockingCount,
    ignoredBlockingCount,
    unresolvedBlockingCount: blockingCount - ignoredBlockingCount
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
  const allowed = new Set(state.issues.filter((issue) => issue.severity === "Error").map((issue) => issue.fingerprint));
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
