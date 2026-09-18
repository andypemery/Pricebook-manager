import type { PrismaClient } from "@prisma/client";
import { createWorksheetPreview, readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import {
  parseSourceRowReferences,
  sourceRowKey,
  sourceRowReferenceFromWorksheet,
  sourceRowReferenceMatches,
  type SourceRowReference
} from "@/lib/data-mapper/source-row-exclusions";
import { outputProfilePreviewRowLimit } from "@/lib/data-mapper/output-profiles/types";
import { maximumSourceWorkbookBytes } from "@/lib/data-mapper/source-workbook-policy";
import {
  getSourceWorkbookStorage,
  type SourceWorkbookStorage,
  type StoredSourceWorkbookMetadata
} from "@/lib/data-mapper/source-workbook-storage";
import {
  getSourceWorkbookUploadIntentSecret,
  SourceWorkbookUploadError,
  validateSourceWorkbookUploadIntent
} from "@/lib/data-mapper/source-workbook-upload";

const maximumSourceWorksheets = 100;
const maximumSourceColumns = 500;
const maximumSourceHeadingLength = 200;
const maximumPreviewCellLength = 500;
const maximumCompactMetadataCharacters = 1_000_000;

type PreparedWorksheet = {
  name: string;
  position: number;
  detectedHeaderRow: number;
  rowCount: number;
  columnCount: number;
  headers: string[];
  sampleRows: string[][];
};

export class SourceWorkbookImportError extends Error {}

async function inspectSourceWorkbook(file: File, requestedExclusions: readonly SourceRowReference[]) {
  if (!(file instanceof File) || file.size === 0) throw new SourceWorkbookImportError("Choose an Excel workbook to continue.");
  if (file.size > maximumSourceWorkbookBytes) throw new SourceWorkbookImportError("The workbook is larger than the 20 MB intake limit.");

  const { workbook, summary } = await readWorkbook(file);
  const validation = validateWorkbook(workbook, summary);
  if (summary.worksheets.length > maximumSourceWorksheets) {
    throw new SourceWorkbookImportError(`The workbook contains more than ${maximumSourceWorksheets} worksheets and cannot be prepared safely.`);
  }
  const worksheets = summary.worksheets.flatMap((worksheetSummary, position): PreparedWorksheet[] => {
    if (worksheetSummary.importStatus !== "Ready" || worksheetSummary.detectedHeaderRow === null) return [];
    if (worksheetSummary.columnCount > maximumSourceColumns) {
      throw new SourceWorkbookImportError(`Worksheet '${worksheetSummary.name}' contains more than ${maximumSourceColumns} columns.`);
    }
    if (worksheetSummary.headers.some((heading) => heading.length > maximumSourceHeadingLength)) {
      throw new SourceWorkbookImportError(`Worksheet '${worksheetSummary.name}' contains a heading longer than ${maximumSourceHeadingLength} characters.`);
    }
    const worksheet = workbook.getWorksheet(worksheetSummary.name);
    if (!worksheet) return [];
    const preview = createWorksheetPreview(worksheetSummary.name, worksheet, worksheetSummary, outputProfilePreviewRowLimit);
    return [{
      name: worksheetSummary.name,
      position,
      detectedHeaderRow: worksheetSummary.detectedHeaderRow,
      rowCount: worksheetSummary.rowCount,
      columnCount: worksheetSummary.columnCount,
      headers: worksheetSummary.headers,
      sampleRows: preview.rows.map((row) => row.map((cell) => cell.length > maximumPreviewCellLength ? `${cell.slice(0, maximumPreviewCellLength - 1)}…` : cell))
    }];
  });

  if (worksheets.length === 0) throw new SourceWorkbookImportError("The workbook does not contain a worksheet with detected headings.");
  if (JSON.stringify(worksheets).length > maximumCompactMetadataCharacters) {
    throw new SourceWorkbookImportError("The workbook's compact preview metadata is too large to store safely.");
  }
  const issueRowKeys = new Set(validation.issues.map((issue) => sourceRowKey(issue.worksheetName, issue.rowNumber)));
  const worksheetSummaries = new Map(summary.worksheets.map((worksheet) => [worksheet.name, worksheet]));
  const validExclusions = new Map<string, SourceRowReference>();
  for (const key of issueRowKeys) {
    const [worksheetName, rowNumberText] = key.split("\u001f");
    const worksheetSummary = worksheetSummaries.get(worksheetName);
    const worksheet = workbook.getWorksheet(worksheetName);
    if (!worksheetSummary || !worksheet) continue;
    const reference = sourceRowReferenceFromWorksheet(worksheet, worksheetName, Number(rowNumberText), worksheetSummary.columnCount);
    if (reference) validExclusions.set(key, reference);
  }
  if (requestedExclusions.some((row) => {
    const current = validExclusions.get(sourceRowKey(row.worksheetName, row.physicalRowNumber));
    return !current || !sourceRowReferenceMatches(current, row);
  })) {
    throw new SourceWorkbookImportError("One or more deleted rows do not belong to this uploaded workbook.");
  }
  return { validation, worksheets, excludedRows: requestedExclusions.map((row) => validExclusions.get(sourceRowKey(row.worksheetName, row.physicalRowNumber))!) };
}

function verifyStoredObject(metadata: StoredSourceWorkbookMetadata | null, expected: { storageKey: string; fileSizeBytes: number; contentType: string }): asserts metadata is StoredSourceWorkbookMetadata {
  if (!metadata) throw new SourceWorkbookImportError("The direct upload did not complete. Please upload the workbook again.");
  if (metadata.storageKey !== expected.storageKey) throw new SourceWorkbookImportError("The uploaded object does not match the authorised private storage path.");
  if (metadata.access !== "private") throw new SourceWorkbookImportError("The uploaded workbook was not stored privately.");
  if (metadata.size <= 0 || metadata.size > maximumSourceWorkbookBytes || metadata.size !== expected.fileSizeBytes) {
    throw new SourceWorkbookImportError("The uploaded workbook size does not match the authorised file.");
  }
  if (metadata.contentType.toLowerCase() !== expected.contentType.toLowerCase()) {
    throw new SourceWorkbookImportError("The uploaded workbook content type does not match the authorised file.");
  }
}

function compatibleReplacementWorksheets(existing: Array<{ id: string; name: string; headers: unknown }>, replacement: PreparedWorksheet[]) {
  const byName = new Map(replacement.map((worksheet) => [worksheet.name, worksheet]));
  for (const worksheet of existing) {
    const next = byName.get(worksheet.name);
    if (!next || JSON.stringify(worksheet.headers) !== JSON.stringify(next.headers)) {
      throw new SourceWorkbookImportError(`The replacement workbook must retain the existing headings for worksheet '${worksheet.name}'.`);
    }
  }
}

async function safelyDeleteUploadedObject(storage: SourceWorkbookStorage, storageKey: string) {
  try {
    await storage.delete(storageKey);
  } catch (error) {
    console.error("[Pricebook Manager] Unregistered source upload cleanup failed", error instanceof Error ? error.message : error);
  }
}

export async function finaliseSourceWorkbookUpload(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  input: { uploadIntent: string; worksheetName?: unknown; ignoredValidationFingerprints?: unknown; excludedRows?: unknown },
  options: { storage?: SourceWorkbookStorage; secret?: string; now?: number } = {}
) {
  const intent = validateSourceWorkbookUploadIntent({
    uploadIntent: input.uploadIntent,
    actor,
    secret: options.secret ?? getSourceWorkbookUploadIntentSecret(),
    now: options.now
  });
  const storage = options.storage ?? getSourceWorkbookStorage();
  const project = await db.project.findFirst({
    where: { id: intent.projectId, tenantId: actor.tenantId },
    select: { id: true, sourceWorkbookImports: { orderBy: { updatedAt: "desc" }, take: 1, select: { id: true } } }
  });
  if (!project) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("The Project is no longer available.");
  }
  const currentProjectSource = project.sourceWorkbookImports[0];
  if (!intent.replaceSourceWorkbookImportId && currentProjectSource && currentProjectSource.id !== intent.uploadId) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("This Project already has a workbook. Use Replace workbook to upload a corrected version.");
  }
  const metadata = await storage.head(intent.storageKey);
  try {
    verifyStoredObject(metadata, intent);
  } catch (error) {
    if (metadata) await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw error;
  }

  const targetSourceWorkbookImportId = intent.replaceSourceWorkbookImportId ?? intent.uploadId;
  const existing = await db.sourceWorkbookImport.findFirst({
    where: { id: targetSourceWorkbookImportId, tenantId: actor.tenantId },
    select: {
      id: true,
      projectId: true,
      originalFileName: true,
      fileReference: { select: { id: true, storageKey: true } },
      worksheets: { orderBy: { position: "asc" }, select: { id: true, name: true, headers: true } }
    }
  });
  if (!intent.replaceSourceWorkbookImportId && existing?.fileReference?.storageKey === intent.storageKey) return { ...existing, verifiedExcludedRows: [] as SourceRowReference[] };
  if (!intent.replaceSourceWorkbookImportId && existing) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("The source workbook upload conflicts with an existing source record.");
  }
  if (intent.replaceSourceWorkbookImportId && existing?.fileReference?.storageKey === intent.storageKey) return { ...existing, verifiedExcludedRows: [] as SourceRowReference[] };
  if (intent.replaceSourceWorkbookImportId && !existing) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("The source workbook to re-upload is no longer available.");
  }
  if (existing && existing.projectId !== intent.projectId) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("The replacement workbook must remain in its existing Project.");
  }

  const bytes = await storage.get(intent.storageKey, { useCache: false });
  if (!bytes || bytes.byteLength !== intent.fileSizeBytes) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("The uploaded workbook could not be retrieved from private storage.");
  }

  let prepared;
  try {
    const requestedExclusions = parseSourceRowReferences(input.excludedRows);
    if (input.excludedRows !== undefined && (!Array.isArray(input.excludedRows) || input.excludedRows.some((row) => parseSourceRowReferences([row]).length !== 1))) {
      throw new SourceWorkbookImportError("One or more deleted rows are not valid for this uploaded workbook.");
    }
    prepared = await inspectSourceWorkbook(new File([bytes], intent.originalFileName, { type: intent.contentType }), requestedExclusions);
    if (existing) compatibleReplacementWorksheets(existing.worksheets, prepared.worksheets);
  } catch (error) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw error;
  }

  const fileReferenceData = {
    tenantId: actor.tenantId,
    originalFileName: intent.originalFileName,
    fileType: intent.contentType,
    fileSizeBytes: intent.fileSizeBytes,
    storageKey: intent.storageKey,
    liveUrl: metadata.url,
    visibility: "private",
    uploadedById: actor.id
  };
  const validationStatus = prepared.validation.summary.totalErrors > 0 ? "VALIDATED_WITH_ERRORS" : "VALIDATED";
  const suppliedIgnoredFingerprints = Array.isArray(input.ignoredValidationFingerprints)
    ? [...new Set(input.ignoredValidationFingerprints.filter((value): value is string => typeof value === "string" && value.length <= 64))]
    : [];
  const blockingFingerprints = new Set(prepared.validation.issues.filter((issue) => issue.severity === "Error").map((issue) => issue.fingerprint));
  if (suppliedIgnoredFingerprints.some((fingerprint) => !blockingFingerprints.has(fingerprint))) {
    await safelyDeleteUploadedObject(storage, intent.storageKey);
    throw new SourceWorkbookImportError("One or more ignored validation issues do not belong to this uploaded workbook.");
  }

  if (!existing) {
    return db.$transaction(async (transaction) => {
      const fileReference = await transaction.fileReference.create({ data: fileReferenceData });
      const sourceImport = await transaction.sourceWorkbookImport.create({
        data: {
          id: intent.uploadId,
          tenantId: actor.tenantId,
          projectId: intent.projectId,
          fileReferenceId: fileReference.id,
          originalFileName: intent.originalFileName,
          fileSizeBytes: intent.fileSizeBytes,
          validationStatus,
          validationSummary: prepared.validation.summary,
          createdById: actor.id,
          validatedAt: new Date(),
          worksheets: { create: prepared.worksheets }
        },
        include: { worksheets: { orderBy: { position: "asc" } } }
      });
      if (suppliedIgnoredFingerprints.length > 0) {
        await transaction.validationIssueOverride.createMany({
          data: suppliedIgnoredFingerprints.map((issueFingerprint) => ({
            tenantId: actor.tenantId,
            sourceWorkbookImportId: sourceImport.id,
            issueFingerprint,
            ignoredById: actor.id
          }))
        });
      }
      if (prepared.excludedRows.length > 0) {
        const worksheetIds = new Map(sourceImport.worksheets.map((worksheet) => [worksheet.name, worksheet.id]));
        await transaction.sourceWorkbookRowExclusion.createMany({
          data: prepared.excludedRows.map((row) => ({
            tenantId: actor.tenantId,
            sourceWorkbookImportId: sourceImport.id,
            sourceWorksheetId: worksheetIds.get(row.worksheetName)!,
            physicalRowNumber: row.physicalRowNumber,
            rowFingerprint: row.rowFingerprint,
            excludedById: actor.id
          }))
        });
      }
      await transaction.project.update({ where: { id: intent.projectId }, data: { updatedById: actor.id } });
      return { ...sourceImport, verifiedExcludedRows: prepared.excludedRows };
    });
  }

  const oldFileReference = existing.fileReference;
  const replacement = await db.$transaction(async (transaction) => {
    const fileReference = await transaction.fileReference.create({ data: fileReferenceData });
    const existingByName = new Map(existing.worksheets.map((worksheet) => [worksheet.name, worksheet]));
    const replacementWorksheetIds = new Map(existing.worksheets.map((worksheet) => [worksheet.name, worksheet.id]));
    for (const worksheet of prepared.worksheets) {
      const previous = existingByName.get(worksheet.name);
      if (previous) {
        await transaction.sourceWorksheet.update({ where: { id: previous.id }, data: worksheet });
      } else {
        const created = await transaction.sourceWorksheet.create({ data: { ...worksheet, sourceWorkbookImportId: existing.id }, select: { id: true } });
        replacementWorksheetIds.set(worksheet.name, created.id);
      }
    }
    await transaction.validationIssueOverride.deleteMany({ where: { tenantId: actor.tenantId, sourceWorkbookImportId: existing.id } });
    await transaction.sourceWorkbookRowExclusion.deleteMany({ where: { tenantId: actor.tenantId, sourceWorkbookImportId: existing.id } });
    if (suppliedIgnoredFingerprints.length > 0) {
      await transaction.validationIssueOverride.createMany({
        data: suppliedIgnoredFingerprints.map((issueFingerprint) => ({
          tenantId: actor.tenantId,
          sourceWorkbookImportId: existing.id,
          issueFingerprint,
          ignoredById: actor.id
        }))
      });
    }
    if (prepared.excludedRows.length > 0) {
      await transaction.sourceWorkbookRowExclusion.createMany({
        data: prepared.excludedRows.map((row) => ({
          tenantId: actor.tenantId,
          sourceWorkbookImportId: existing.id,
          sourceWorksheetId: replacementWorksheetIds.get(row.worksheetName)!,
          physicalRowNumber: row.physicalRowNumber,
          rowFingerprint: row.rowFingerprint,
          excludedById: actor.id
        }))
      });
    }
    const sourceImport = await transaction.sourceWorkbookImport.update({
      where: { id: existing.id },
      data: {
        fileReferenceId: fileReference.id,
        originalFileName: intent.originalFileName,
        fileSizeBytes: intent.fileSizeBytes,
        validationStatus,
        validationSummary: prepared.validation.summary,
        validatedAt: new Date()
      },
      include: { worksheets: { orderBy: { position: "asc" } } }
    });
    await transaction.project.update({ where: { id: intent.projectId }, data: { updatedById: actor.id } });
    return { ...sourceImport, verifiedExcludedRows: prepared.excludedRows };
  });

  if (oldFileReference && oldFileReference.storageKey !== intent.storageKey) {
    try {
      await storage.delete(oldFileReference.storageKey);
      await db.fileReference.deleteMany({ where: { id: oldFileReference.id, tenantId: actor.tenantId, sourceWorkbookImports: { none: {} } } });
    } catch (error) {
      console.error("[Pricebook Manager] Replaced source workbook cleanup failed", error instanceof Error ? error.message : error);
    }
  }
  return replacement;
}

export { maximumSourceWorkbookBytes, SourceWorkbookUploadError };
