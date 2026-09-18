import ExcelJS from "exceljs";
import { Zip, ZipDeflate } from "fflate";
import type { PrismaClient } from "@prisma/client";
import { configuredWorksheetName, effectiveWorksheetName, validateWorksheetNames } from "@/lib/data-mapper/output-profiles/configuration";
import { resolveOutputFilename, resolveOutputPackageFilename } from "@/lib/data-mapper/output-profiles/filename";
import { outputValueForColumn, sourceRowMatchesFilter } from "@/lib/data-mapper/output-profiles/rules";
import type { GenerateOutputProfileInput, OutputProfileColumnDraft, OutputProfileFilterDraft, OutputProfileFormat } from "@/lib/data-mapper/output-profiles/types";
import { stringArrayFromJson, validateOutputProfileInput } from "@/lib/data-mapper/output-profiles/validation";
import { resolveWorksheetCompatibility, sourceIndexForHeading } from "@/lib/data-mapper/output-profiles/worksheet-compatibility";
import { loadSourceValidationState, SourceWorkbookUnavailableError } from "@/lib/data-mapper/validation-overrides";
import { sourceRowKey } from "@/lib/data-mapper/source-row-exclusions";

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

function csvBytes(headings: string[], rows: string[][], includeHeader: boolean, delimiterName: "COMMA" | "SEMICOLON" | "TAB" | "PIPE") {
  const delimiter = csvDelimiter(delimiterName);
  const lines = includeHeader ? [headings, ...rows] : rows;
  return new TextEncoder().encode(lines.map((row) => row.map((value) => csvCell(value, delimiter)).join(delimiter)).join("\r\n"));
}

async function xlsxBytes(sheets: Array<{ name: string; headings: string[]; rows: string[][] }>) {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const outputSheet = workbook.addWorksheet(sheet.name);
    outputSheet.addRow(sheet.headings.map(safeCellText));
    for (const row of sheet.rows) outputSheet.addRow(row.map(safeCellText));
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function zipGeneratedFiles(files: Array<{ fileName: string; bytes: () => Promise<Uint8Array> }>) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const archive = new Zip((error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(chunk);
      if (final) {
        const length = chunks.reduce((sum, item) => sum + item.length, 0);
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const item of chunks) {
          bytes.set(item, offset);
          offset += item.length;
        }
        resolve(bytes);
      }
    });
    void (async () => {
      try {
        for (const file of files) {
          const entry = new ZipDeflate(file.fileName, { level: 6 });
          archive.add(entry);
          entry.push(await file.bytes(), true);
        }
        archive.end();
      } catch (error) {
        reject(error);
      }
    })();
  });
}

type GeneratedWorksheet = { sourceName: string; outputName: string; headings: string[]; rows: string[][] };

export type GeneratedOutput = {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  rowCount: number;
  worksheetCount: number;
  zeroRowWorksheetNames: string[];
  ignoredBlockingCount: number;
};

export async function generateOutputForTenant(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  input: GenerateOutputProfileInput,
  effectiveDate: string
): Promise<GeneratedOutput> {
  const sourceImport = await db.sourceWorkbookImport.findFirst({
    where: { id: input.sourceWorkbookImportId, tenantId: actor.tenantId },
    select: {
      id: true,
      originalFileName: true,
      worksheets: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, position: true, detectedHeaderRow: true, headers: true }
      }
    }
  });
  if (!sourceImport) throw new OutputGenerationError("The selected source workbook is not available.");
  const referenceWorksheet = sourceImport.worksheets.find((worksheet) => worksheet.id === input.sourceWorksheetId);
  if (!referenceWorksheet) throw new OutputGenerationError("The selected source worksheet is not available.");
  const selectedIds = [...new Set(Array.isArray(input.selectedWorksheetIds) ? input.selectedWorksheetIds : [input.sourceWorksheetId])];
  if (selectedIds.length === 0) throw new OutputGenerationError("Select at least one worksheet to include.");
  const selectedIdSet = new Set(selectedIds);
  if (selectedIds.some((id) => !sourceImport.worksheets.some((worksheet) => worksheet.id === id))) {
    throw new OutputGenerationError("One or more selected worksheets do not belong to this source workbook.");
  }
  const selectedWorksheets = sourceImport.worksheets.filter((worksheet) => selectedIdSet.has(worksheet.id));
  const referenceHeaders = stringArrayFromJson(referenceWorksheet.headers, "Source headings");
  const validated = validateOutputProfileInput(
    input,
    referenceHeaders,
    sourceImport.originalFileName,
    sourceImport.worksheets.map((worksheet) => worksheet.name)
  );
  if (validated.columns.length === 0) throw new OutputGenerationError("Add at least one output column before generating this file.");

  const compatibilities = selectedWorksheets.map((worksheet) => {
    const headers = stringArrayFromJson(worksheet.headers, "Source headings");
    return { worksheet, headers, compatibility: resolveWorksheetCompatibility(validated, headers) };
  });
  const incompatible = compatibilities.filter((item) => !item.compatibility.compatible);
  if (incompatible.length > 0) {
    const detail = incompatible.map((item) => `${item.worksheet.name}: ${item.compatibility.issues.join(" ")}`).join(" ");
    throw new OutputGenerationError(`This profile is not compatible with ${incompatible.length} ${incompatible.length === 1 ? "worksheet" : "worksheets"}. ${detail}`);
  }

  const validation = await loadSourceValidationState(db, actor.tenantId, sourceImport.id);
  const selectedNames = new Set(selectedWorksheets.map((worksheet) => worksheet.name));
  const selectedBlockingIssues = validation.issues.filter((issue) => issue.severity === "Error" && selectedNames.has(issue.worksheetName));
  const unresolvedBlockingCount = selectedBlockingIssues.filter((issue) => !issue.ignored).length;
  const ignoredBlockingCount = selectedBlockingIssues.length - unresolvedBlockingCount;
  if (unresolvedBlockingCount > 0) {
    throw new OutputGenerationError(`Resolve or ignore the remaining ${unresolvedBlockingCount} blocking ${unresolvedBlockingCount === 1 ? "error" : "errors"} before generating this file.`);
  }

  const headings = validated.columns.map((column) => column.outputHeading);
  const generatedWorksheets: GeneratedWorksheet[] = [];
  for (const item of compatibilities) {
    const sourceSheet = validation.workbook.getWorksheet(item.worksheet.name);
    if (!sourceSheet) throw new OutputGenerationError(`Worksheet “${item.worksheet.name}” is no longer available in the uploaded workbook.`);
    const outputColumns = validated.columns.map((column, index) => ({
      ...column,
      clientId: `generated-${index}`,
      sourceColumnIndex: column.columnType === "SOURCE" && column.sourceHeading
        ? sourceIndexForHeading(item.compatibility, column.sourceHeading) ?? null
        : null,
      adjustmentValue: column.adjustmentValue ?? "",
      staticValue: column.staticValue ?? ""
    })) as OutputProfileColumnDraft[];
    const filters = validated.filters.map((filter, index) => ({
      ...filter,
      clientId: `filter-${index}`,
      sourceColumnIndex: sourceIndexForHeading(item.compatibility, filter.sourceHeading) ?? null,
      comparisonValue: filter.comparisonValue ?? ""
    })) as OutputProfileFilterDraft[];
    const rows: string[][] = [];
    for (let rowNumber = item.worksheet.detectedHeaderRow + 1; rowNumber <= sourceSheet.rowCount; rowNumber += 1) {
      if (validation.excludedRowKeys?.has(sourceRowKey(item.worksheet.name, rowNumber))) continue;
      const row = sourceSheet.getRow(rowNumber);
      const sourceRow = Array.from({ length: item.headers.length }, (_, index) => cellText(row.getCell(index + 1).value));
      if (!sourceRow.some((value) => value.trim())) continue;
      const matches = filters.length === 0 || (validated.filterMatchMode === "ALL"
        ? filters.every((filter) => sourceRowMatchesFilter(sourceRow, filter))
        : filters.some((filter) => sourceRowMatchesFilter(sourceRow, filter)));
      if (matches) rows.push(outputColumns.map((column) => outputValueForColumn(column, sourceRow)));
    }
    generatedWorksheets.push({
      sourceName: item.worksheet.name,
      outputName: configuredWorksheetName(validated, item.worksheet.name),
      headings,
      rows
    });
  }

  const rowCount = generatedWorksheets.reduce((sum, worksheet) => sum + worksheet.rows.length, 0);
  if (rowCount === 0) throw new OutputGenerationError("No source rows matched the current Output Profile filters.");
  const zeroRowWorksheetNames = generatedWorksheets.filter((worksheet) => worksheet.rows.length === 0).map((worksheet) => worksheet.sourceName);
  const baseResult = { rowCount, worksheetCount: generatedWorksheets.length, zeroRowWorksheetNames, ignoredBlockingCount };

  if (validated.worksheetMode === "COMBINE") {
    const filename = resolvedFilename(validated, sourceImport.originalFileName, effectiveDate, validated.outputFormat);
    const rows = generatedWorksheets.flatMap((worksheet) => worksheet.rows);
    if (validated.outputFormat === "CSV") {
      return { ...baseResult, bytes: csvBytes(headings, rows, validated.csvIncludeHeader, validated.csvDelimiter), fileName: filename, contentType: "text/csv; charset=utf-8" };
    }
    const name = effectiveWorksheetName(validated.name, validated.xlsxWorksheetName ?? "");
    return { ...baseResult, bytes: await xlsxBytes([{ name, headings, rows }]), fileName: filename, contentType: xlsxContentType };
  }

  if (validated.worksheetMode === "SEPARATE_WORKSHEETS") {
    const worksheetNameIssues = validateWorksheetNames(generatedWorksheets.map((worksheet) => worksheet.outputName));
    if (worksheetNameIssues[0]) throw new OutputGenerationError(worksheetNameIssues[0]);
    const filename = resolvedFilename(validated, sourceImport.originalFileName, effectiveDate, "XLSX");
    return {
      ...baseResult,
      bytes: await xlsxBytes(generatedWorksheets.map((worksheet) => ({ name: worksheet.outputName, headings, rows: worksheet.rows }))),
      fileName: filename,
      contentType: xlsxContentType
    };
  }

  const files = generatedWorksheets.map((worksheet) => {
    const fileName = resolvedFilename(validated, sourceImport.originalFileName, effectiveDate, validated.outputFormat, worksheet.outputName, true);
    return {
      fileName,
      bytes: () => validated.outputFormat === "CSV"
        ? Promise.resolve(csvBytes(headings, worksheet.rows, validated.csvIncludeHeader, validated.csvDelimiter))
        : xlsxBytes([{ name: worksheet.outputName, headings, rows: worksheet.rows }])
    };
  });
  const duplicateFilename = files.find((file, index) => files.findIndex((candidate) => candidate.fileName.toLocaleLowerCase("en-GB") === file.fileName.toLocaleLowerCase("en-GB")) !== index);
  if (duplicateFilename) throw new OutputGenerationError(`Separate worksheet files resolve to the duplicate filename “${duplicateFilename.fileName}”.`);
  if (files.length === 1) {
    return {
      ...baseResult,
      bytes: await files[0].bytes(),
      fileName: files[0].fileName,
      contentType: validated.outputFormat === "CSV" ? "text/csv; charset=utf-8" : xlsxContentType
    };
  }
  const packageName = resolveOutputPackageFilename({
    filenameTemplate: validated.filenameTemplate,
    profileName: validated.name,
    sourceFilename: sourceImport.originalFileName,
    effectiveDate
  });
  if (packageName.errors.length > 0) throw new OutputGenerationError(packageName.errors[0]);
  return { ...baseResult, bytes: await zipGeneratedFiles(files), fileName: packageName.finalFilename, contentType: "application/zip" };
}

const xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function resolvedFilename(
  profile: ReturnType<typeof validateOutputProfileInput>,
  sourceFilename: string,
  effectiveDate: string,
  outputFormat: OutputProfileFormat,
  worksheetName?: string,
  appendWorksheetSuffix = false
) {
  const filename = resolveOutputFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate,
    outputFormat,
    worksheetName,
    appendWorksheetSuffix
  });
  if (!filename.finalFilename || filename.errors.length > 0) throw new OutputGenerationError(filename.errors[0] ?? "The output filename is not valid.");
  return filename.finalFilename;
}

export { SourceWorkbookUnavailableError };
