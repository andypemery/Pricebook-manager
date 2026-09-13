import type { PrismaClient } from "@prisma/client";
import { createWorksheetPreview, readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import { outputProfilePreviewRowLimit } from "@/lib/data-mapper/output-profiles/types";

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
  file: File
) {
  if (!(file instanceof File) || file.size === 0) throw new SourceWorkbookImportError("Choose an Excel workbook to continue.");
  if (file.size > maximumSourceWorkbookBytes) throw new SourceWorkbookImportError("The workbook is larger than the 20 MB intake limit.");

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

  return db.sourceWorkbookImport.create({
    data: {
      tenantId: actor.tenantId,
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
}
