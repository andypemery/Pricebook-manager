import { normaliseSourceHeading } from "@/lib/data-mapper/output-profiles/compatibility";
type ProfileShape = {
  columns: readonly { columnType: "SOURCE" | "STATIC"; sourceHeading: string | null }[];
  filters: readonly { sourceHeading: string }[];
};

export type WorksheetCompatibility = {
  compatible: boolean;
  issues: string[];
  sourceColumnIndexes: Map<string, number>;
};

export function resolveWorksheetCompatibility(profile: ProfileShape, headers: readonly string[]): WorksheetCompatibility {
  const candidates = new Map<string, number[]>();
  headers.forEach((heading, index) => {
    const key = normaliseSourceHeading(heading);
    const indexes = candidates.get(key) ?? [];
    indexes.push(index);
    candidates.set(key, indexes);
  });
  const requiredHeadings = new Map<string, string>();
  for (const column of profile.columns) {
    if (column.columnType === "SOURCE" && column.sourceHeading) requiredHeadings.set(normaliseSourceHeading(column.sourceHeading), column.sourceHeading);
  }
  for (const filter of profile.filters) requiredHeadings.set(normaliseSourceHeading(filter.sourceHeading), filter.sourceHeading);

  const issues: string[] = [];
  const sourceColumnIndexes = new Map<string, number>();
  for (const [key, expectedHeading] of requiredHeadings) {
    const indexes = candidates.get(key) ?? [];
    if (indexes.length === 0) issues.push(`Missing source heading “${expectedHeading}”.`);
    else if (indexes.length > 1) issues.push(`Source heading “${expectedHeading}” is ambiguous.`);
    else sourceColumnIndexes.set(key, indexes[0]);
  }
  return { compatible: issues.length === 0, issues, sourceColumnIndexes };
}

export function sourceIndexForHeading(compatibility: WorksheetCompatibility, heading: string) {
  return compatibility.sourceColumnIndexes.get(normaliseSourceHeading(heading));
}
