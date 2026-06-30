import type { HeaderDetectionResult } from "@/lib/data-mapper/types";

const maxHeaderScanRows = 25;

function normaliseCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isLikelyHeader(value: string) {
  return /[A-Za-z]/.test(value) && value.length <= 80;
}

function scoreHeaderRow(row: readonly unknown[]) {
  const values = row.map(normaliseCell).filter(Boolean);
  const uniqueValues = new Set(values.map((value) => value.toLowerCase()));
  const textCells = values.filter(isLikelyHeader).length;
  const duplicatePenalty = values.length - uniqueValues.size;
  return textCells * 2 + uniqueValues.size - duplicatePenalty * 3;
}

export function detectHeaderRow(rows: readonly (readonly unknown[])[]): HeaderDetectionResult {
  const candidates = rows.slice(0, maxHeaderScanRows).map((row, index) => ({
    rowNumber: index + 1,
    row,
    score: scoreHeaderRow(row)
  }));
  const best = candidates.reduce<(typeof candidates)[number] | null>((currentBest, candidate) => {
    if (!currentBest || candidate.score > currentBest.score) return candidate;
    return currentBest;
  }, null);

  if (!best || best.score < 3) {
    return {
      rowNumber: null,
      headers: [],
      confidence: "none",
      message: "No clear header row was detected."
    };
  }

  const headers = best.row.map(normaliseCell);
  const populatedHeaderCount = headers.filter(Boolean).length;
  const confidence = populatedHeaderCount >= 4 && best.score >= 10 ? "high" : populatedHeaderCount >= 2 ? "medium" : "low";

  if (populatedHeaderCount < 2) {
    return {
      rowNumber: null,
      headers: [],
      confidence: "none",
      message: "The worksheet does not contain enough populated headers."
    };
  }

  return {
    rowNumber: best.rowNumber,
    headers,
    confidence,
    message: confidence === "low" ? "Headers were detected with low confidence." : null
  };
}

export function displayHeaders(headers: readonly string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => {
    const header = headers[index]?.trim();
    return header || `Column ${index + 1}`;
  });
}
