import type { OutputProfileColumnDraft } from "@/lib/data-mapper/output-profiles/types";

export function addSourceColumn(
  columns: readonly OutputProfileColumnDraft[],
  source: { sourceColumnIndex: number; sourceHeading: string },
  clientId: string
) {
  return [
    ...columns,
    {
      clientId,
      sourceColumnIndex: source.sourceColumnIndex,
      sourceHeading: source.sourceHeading,
      outputHeading: source.sourceHeading
    }
  ];
}
export function renameOutputColumn(columns: readonly OutputProfileColumnDraft[], clientId: string, outputHeading: string) {
  return columns.map((column) => column.clientId === clientId ? { ...column, outputHeading } : column);
}

export function removeOutputColumn(columns: readonly OutputProfileColumnDraft[], clientId: string) {
  return columns.filter((column) => column.clientId !== clientId);
}

export function moveOutputColumn(columns: readonly OutputProfileColumnDraft[], clientId: string, targetIndex: number) {
  const currentIndex = columns.findIndex((column) => column.clientId === clientId);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= columns.length || currentIndex === targetIndex) return [...columns];
  const next = [...columns];
  const [column] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, column);
  return next;
}

export function mappedSourceColumnIndexes(columns: readonly OutputProfileColumnDraft[]) {
  return new Set(columns.map((column) => column.sourceColumnIndex));
}

export function outputPreviewRows(columns: readonly OutputProfileColumnDraft[], sampleRows: readonly (readonly string[])[]) {
  return sampleRows.slice(0, 3).map((sourceRow) => columns.map((column) => sourceRow[column.sourceColumnIndex] ?? ""));
}
