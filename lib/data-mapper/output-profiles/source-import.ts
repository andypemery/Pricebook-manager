import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createWorksheetPreview, readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import { outputProfilePreviewRowLimit } from "@/lib/data-mapper/output-profiles/types";
import {
  getSourceWorkbookStorage,
  sourceWorkbookExtension,
  sourceWorkbookStorageKey,
  type SourceWorkbookStorage
} from "@/lib/data-mapper/source-workbook-storage";

export const maximumSourceWorkbookBytes = 20 * 1024 * 1024;
const maximumSourceWorksheets = 100;
const maximumSourceColumns = 500;
const maximumSourceHeadingLength = 200;
const maximumPreviewCellLength = 500;
const maximumCompactMetadataCharacters = 1_000_000;

export class SourceWorkbookImportError extends Error {}

export async function createSourceWorkbookImportFromFile(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  file: File,
  storage: SourceWorkbookStorage = getSourceWorkbookStorage()
) {
  if (!(file instanceof File) || file.size === 0) throw new SourceWorkbookImportError("Choose an Excel workbook to continue.");
  if (file.size > maximumSourceWorkbookBytes) throw new SourceWorkbookImportError("The workbook is larger than the 20 MB intake limit.");
  const extension = sourceWorkbookExtension(file.name);
  if (!extension) throw new SourceWorkbookImportError("Choose an .xlsx or .xlsm workbook to continue.");

  const { workbook, summary } = await readWorkbook(file);
  const validation = validateWorkbook(workbook, summary);
  if (summary.worksheets.length > maximumSourceWorksheets) {
    throw new SourceWorkbookImportError(`The workbook contains more than ${maximumSourceWorksheets} worksheets and cannot be prepared safely.`);
  }
  const worksheets = summary.worksheets.flatMap((worksheetSummary, position) => {
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

  const sourceImportId = randomUUID();
  const storageKey = sourceWorkbookStorageKey(actor.tenantId, sourceImportId, extension);
  const fileReference = await db.fileReference.create({
    data: {
      tenantId: actor.tenantId,
      originalFileName: file.name,
      fileType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSizeBytes: file.size,
      storageKey,
      visibility: "private",
      uploadedById: actor.id
    }
  });

  try {
    const stored = await storage.put({ storageKey, bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const sourceImport = await db.sourceWorkbookImport.create({
      data: {
        id: sourceImportId,
        tenantId: actor.tenantId,
        fileReferenceId: fileReference.id,
        originalFileName: file.name,
        fileSizeBytes: file.size,
        validationStatus: validation.summary.totalErrors > 0 ? "VALIDATED_WITH_ERRORS" : "VALIDATED",
        validationSummary: validation.summary,
        createdById: actor.id,
        validatedAt: new Date(),
        worksheets: { create: worksheets }
      },
      include: { worksheets: { orderBy: { position: "asc" } } }
    });
    await db.fileReference.update({ where: { id: fileReference.id }, data: { liveUrl: stored.url } });
    return sourceImport;
  } catch (error) {
    await Promise.allSettled([storage.delete(storageKey), db.fileReference.delete({ where: { id: fileReference.id } })]);
    throw error;
  }
}
