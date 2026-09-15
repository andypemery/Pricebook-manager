import { resolveOutputFilename } from "@/lib/data-mapper/output-profiles/filename";
import type { OutputProfileDraft } from "@/lib/data-mapper/output-profiles/types";

const invalidWorksheetCharacters = /[\\/*?:\[\]]/;
const invalidWorksheetCharactersGlobal = /[\\/*?:\[\]]/g;

export function validateWorksheetName(value: unknown) {
  if (typeof value !== "string") return "Worksheet name must be text.";
  if (!value.trim()) return null;
  const name = value.trim();
  if (name.length > 31) return "Worksheet name must be 31 characters or fewer.";
  if (invalidWorksheetCharacters.test(name)) return "Worksheet name cannot contain \\, /, *, ?, :, [ or ].";
  if (name.startsWith("'") || name.endsWith("'")) return "Worksheet name cannot begin or end with an apostrophe.";
  return null;
}

export function defaultWorksheetName(profileName: string) {
  const normalised = profileName.replace(invalidWorksheetCharactersGlobal, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "");
  return (normalised || "Output").slice(0, 31);
}

export function effectiveWorksheetName(profileName: string, configuredName: string) {
  return configuredName.trim() || defaultWorksheetName(profileName);
}

export function outputProfileAttentionIssues(
  profile: OutputProfileDraft,
  sourceFilename: string,
  effectiveDate: string
) {
  const issues: string[] = [];
  if (!profile.name.trim()) issues.push("Add a profile name.");
  if (profile.columns.length === 0) issues.push("Add at least one output column.");
  const filename = resolveOutputFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate,
    outputFormat: profile.outputFormat
  });
  issues.push(...filename.errors);
  if (profile.outputFormat === "XLSX") {
    const worksheetIssue = validateWorksheetName(profile.xlsxWorksheetName);
    if (worksheetIssue) issues.push(worksheetIssue);
  }
  return [...new Set(issues)];
}
