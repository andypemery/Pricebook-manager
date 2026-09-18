import type ExcelJS from "exceljs";

export type SourceRowReference = {
  worksheetName: string;
  physicalRowNumber: number;
  rowFingerprint: string;
};

export function sourceRowKey(worksheetName: string, physicalRowNumber: number) {
  return `${worksheetName}\u001f${physicalRowNumber}`;
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    return "";
  }
  return String(value).trim();
}

function fnv1a32(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// The fingerprint binds the worksheet, physical row and complete current row.
// It is always recalculated from the private workbook before persistence.
export function sourceRowFingerprint(worksheetName: string, physicalRowNumber: number, cells: readonly string[]) {
  const canonical = JSON.stringify(["v1", worksheetName, physicalRowNumber, cells]);
  return `v1-${fnv1a32(canonical, 2166136261)}${fnv1a32(canonical, 3339675911)}`;
}

export function sourceRowReferenceFromWorksheet(
  worksheet: ExcelJS.Worksheet,
  worksheetName: string,
  physicalRowNumber: number,
  columnCount: number
): SourceRowReference | null {
  if (!Number.isSafeInteger(physicalRowNumber) || physicalRowNumber < 1 || physicalRowNumber > worksheet.rowCount) return null;
  const row = worksheet.getRow(physicalRowNumber);
  const cells = Array.from({ length: columnCount }, (_, index) => cellText(row.getCell(index + 1).value));
  if (!cells.some(Boolean)) return null;
  return {
    worksheetName,
    physicalRowNumber,
    rowFingerprint: sourceRowFingerprint(worksheetName, physicalRowNumber, cells)
  };
}

export function sourceRowReferenceMatches(left: SourceRowReference, right: SourceRowReference) {
  return left.worksheetName === right.worksheetName
    && left.physicalRowNumber === right.physicalRowNumber
    && left.rowFingerprint === right.rowFingerprint;
}

export function parseSourceRowReferences(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, SourceRowReference>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<SourceRowReference>;
    if (typeof candidate.worksheetName !== "string" || candidate.worksheetName.length === 0 || candidate.worksheetName.length > 31) continue;
    if (!Number.isSafeInteger(candidate.physicalRowNumber) || (candidate.physicalRowNumber ?? 0) < 1) continue;
    if (typeof candidate.rowFingerprint !== "string" || !/^v1-[0-9a-f]{16}$/.test(candidate.rowFingerprint)) continue;
    const reference = candidate as SourceRowReference;
    unique.set(sourceRowKey(reference.worksheetName, reference.physicalRowNumber), reference);
  }
  return [...unique.values()];
}
