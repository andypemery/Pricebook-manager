import { buildOutputPreview } from "@/lib/data-mapper/output-profiles/rules";
import type {
  OutputProfileColumnDraft,
  OutputProfileFilterDraft,
  OutputProfileFilterMatchMode
} from "@/lib/data-mapper/output-profiles/types";

export function addSourceColumn(
  columns: readonly OutputProfileColumnDraft[],
  source: { sourceColumnIndex: number; sourceHeading: string },
  clientId: string,
  insertionIndex = columns.length
) {
  const target = Math.max(0, Math.min(insertionIndex, columns.length));
  const column = {
    clientId,
    columnType: "SOURCE" as const,
    sourceColumnIndex: source.sourceColumnIndex,
    sourceHeading: source.sourceHeading,
    outputHeading: source.sourceHeading,
    staticValue: "",
    adjustmentType: "NONE" as const,
    adjustmentValue: "",
    roundingDecimalPlaces: null
  };
  return [...columns.slice(0, target), column, ...columns.slice(target)];
}

export function addStaticColumn(columns: readonly OutputProfileColumnDraft[], clientId: string) {
  return [
    ...columns,
    {
      clientId,
      columnType: "STATIC" as const,
      sourceColumnIndex: null,
      sourceHeading: null,
      outputHeading: "New column",
      staticValue: "",
      adjustmentType: "NONE" as const,
      adjustmentValue: "",
      roundingDecimalPlaces: null
    }
  ];
}

export function updateOutputColumn(
  columns: readonly OutputProfileColumnDraft[],
  clientId: string,
  changes: Partial<Omit<OutputProfileColumnDraft, "clientId" | "columnType" | "sourceColumnIndex" | "sourceHeading">>
) {
  return columns.map((column) => column.clientId === clientId ? { ...column, ...changes } : column);
}

export function renameOutputColumn(columns: readonly OutputProfileColumnDraft[], clientId: string, outputHeading: string) {
  return updateOutputColumn(columns, clientId, { outputHeading });
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

export function outputColumnTargetIndex(
  columns: readonly OutputProfileColumnDraft[],
  clientId: string,
  insertionIndex: number
) {
  const currentIndex = columns.findIndex((column) => column.clientId === clientId);
  if (currentIndex < 0 || columns.length === 0) return -1;
  const clampedInsertion = Math.max(0, Math.min(insertionIndex, columns.length));
  const targetIndex = currentIndex < clampedInsertion ? clampedInsertion - 1 : clampedInsertion;
  return Math.max(0, Math.min(targetIndex, columns.length - 1));
}

export function mappedSourceColumnIndexes(columns: readonly OutputProfileColumnDraft[]) {
  return new Set(columns.flatMap((column) => column.columnType === "SOURCE" && column.sourceColumnIndex !== null ? [column.sourceColumnIndex] : []));
}

export function addFilter(
  filters: readonly OutputProfileFilterDraft[],
  source: { sourceColumnIndex: number; sourceHeading: string },
  clientId: string
) {
  return [...filters, { clientId, ...source, operator: "EQUALS" as const, comparisonValue: "" }];
}

export function updateFilter(
  filters: readonly OutputProfileFilterDraft[],
  clientId: string,
  changes: Partial<Omit<OutputProfileFilterDraft, "clientId">>
) {
  return filters.map((filter) => filter.clientId === clientId ? { ...filter, ...changes } : filter);
}

export function removeFilter(filters: readonly OutputProfileFilterDraft[], clientId: string) {
  return filters.filter((filter) => filter.clientId !== clientId);
}

export function moveFilter(filters: readonly OutputProfileFilterDraft[], clientId: string, targetIndex: number) {
  const currentIndex = filters.findIndex((filter) => filter.clientId === clientId);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= filters.length || currentIndex === targetIndex) return [...filters];
  const next = [...filters];
  const [filter] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, filter);
  return next;
}

export function outputPreviewRows(
  columns: readonly OutputProfileColumnDraft[],
  sampleRows: readonly (readonly string[])[],
  filters: readonly Omit<OutputProfileFilterDraft, "clientId">[] = [],
  matchMode: OutputProfileFilterMatchMode = "ALL"
) {
  return buildOutputPreview(columns, sampleRows, filters, matchMode).outputRows;
}
