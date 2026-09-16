import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { resolveOutputFilename } from "@/lib/data-mapper/output-profiles/filename";
import { outputValueForColumn, sourceRowMatchesFilter } from "@/lib/data-mapper/output-profiles/rules";
import type { OutputProfileColumnDraft, SaveOutputProfileInput } from "@/lib/data-mapper/output-profiles/types";
import { stringArrayFromJson, validateOutputProfileInput } from "@/lib/data-mapper/output-profiles/validation";
import { loadSourceValidationState, SourceWorkbookUnavailableError } from "@/lib/data-mapper/validation-overrides";

export class OutputGenerationError extends Error {}

function csvDelimiter(value: "COMMA" | "SEMICOLON" | "TAB" | "PIPE") {
  return { COMMA: ",", SEMICOLON: ";", TAB: "\t", PIPE: "|" }[value];
}

function safeCellText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string, delimiter: string) {
  const safe = safeCellText(value);
  return safe.includes(delimiter) || safe.includes('"') || /[\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    return "";
  }
  return String(value);
}

export type GeneratedOutput = { bytes: Uint8Array; fileName: string; contentType: string; rowCount: number; ignoredBlockingCount: number };

export async function generateOutputForTenant(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  input: SaveOutputProfileInput,
  effectiveDate: string
): Promise<GeneratedOutput> {
  const source = await db.sourceWorksheet.findFirst({
    where: { id: input.sourceWorksheetId, sourceWorkbookImportId: input.sourceWorkbookImportId, sourceWorkbookImport: { tenantId: actor.tenantId } },
    select: { id: true, name: true, detectedHeaderRow: true, headers: true, sourceWorkbookImport: { select: { id: true, originalFileName: true } } }
  });
  if (!source) throw new OutputGenerationError("The selected source worksheet is not available.");
  const validated = validateOutputProfileInput(input, stringArrayFromJson(source.headers, "Source headings"), source.sourceWorkbookImport.originalFileName);
  if (validated.columns.length === 0) throw new OutputGenerationError("Add at least one output column before generating this file.");
  const validation = await loadSourceValidationState(db, actor.tenantId, source.sourceWorkbookImport.id);
  if (validation.unresolvedBlockingCount > 0) throw new OutputGenerationError(`Resolve or ignore the remaining ${validation.unresolvedBlockingCount} blocking ${validation.unresolvedBlockingCount === 1 ? "error" : "errors"} before generating this file.`);
  const worksheet = validation.workbook.getWorksheet(source.name);
  if (!worksheet) throw new OutputGenerationError("The selected source worksheet is no longer available in the uploaded workbook.");
  const outputColumns = validated.columns.map((column, index) => ({ ...column, clientId: `generated-${index}`, adjustmentValue: column.adjustmentValue ?? "", staticValue: column.staticValue ?? "" })) as OutputProfileColumnDraft[];
  const filters = validated.filters.map((filter) => ({ ...filter, comparisonValue: filter.comparisonValue ?? "" }));
  const outputRows: string[][] = [];
  for (let rowNumber = source.detectedHeaderRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const sourceRow = Array.from({ length: source.headers instanceof Array ? source.headers.length : stringArrayFromJson(source.headers, "Source headings").length }, (_, index) => cellText(row.getCell(index + 1).value));
    if (!sourceRow.some((value) => value.trim())) continue;
    const matches = validated.filters.length === 0 || (validated.filterMatchMode === "ALL"
      ? filters.every((filter) => sourceRowMatchesFilter(sourceRow, filter))
      : filters.some((filter) => sourceRowMatchesFilter(sourceRow, filter)));
    if (matches) outputRows.push(outputColumns.map((column) => outputValueForColumn(column, sourceRow)));
  }
  if (outputRows.length === 0) throw new OutputGenerationError("No source rows matched the current Output Profile filters.");
  const filename = resolveOutputFilename({ filenameTemplate: validated.filenameTemplate, profileName: validated.name, sourceFilename: source.sourceWorkbookImport.originalFileName, effectiveDate, outputFormat: validated.outputFormat });
  if (!filename.finalFilename || filename.errors.length > 0) throw new OutputGenerationError(filename.errors[0] ?? "The output filename is not valid.");
  const headings = outputColumns.map((column) => column.outputHeading);
  if (validated.outputFormat === "CSV") {
    const delimiter = csvDelimiter(validated.csvDelimiter);
    const lines = validated.csvIncludeHeader ? [headings, ...outputRows] : outputRows;
    return { bytes: new TextEncoder().encode(lines.map((row) => row.map((value) => csvCell(value, delimiter)).join(delimiter)).join("\r\n")), fileName: filename.finalFilename, contentType: "text/csv; charset=utf-8", rowCount: outputRows.length, ignoredBlockingCount: validation.ignoredBlockingCount };
  }
  const workbook = new ExcelJS.Workbook();
  const outputSheet = workbook.addWorksheet(validated.xlsxWorksheetName || validated.name.slice(0, 31) || "Output");
  outputSheet.addRow(headings.map(safeCellText));
  for (const row of outputRows) outputSheet.addRow(row.map(safeCellText));
  return { bytes: new Uint8Array(await workbook.xlsx.writeBuffer()), fileName: filename.finalFilename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", rowCount: outputRows.length, ignoredBlockingCount: validation.ignoredBlockingCount };
}

export { SourceWorkbookUnavailableError };
