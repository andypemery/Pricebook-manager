import { resolveOutputFilename } from "@/lib/data-mapper/output-profiles/filename";
import type { OutputProfileDraft } from "@/lib/data-mapper/output-profiles/types";
import { normaliseSourceHeading } from "@/lib/data-mapper/output-profiles/compatibility";
import { resolveWorksheetCompatibility } from "@/lib/data-mapper/output-profiles/worksheet-compatibility";

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

export function normaliseWorksheetIdentity(value: string) {
  return normaliseSourceHeading(value);
}

export function configuredWorksheetName(profile: Pick<OutputProfileDraft, "worksheetNameMode" | "worksheetNameMappings">, sourceName: string) {
  if (profile.worksheetNameMode !== "CUSTOM") return sourceName;
  return profile.worksheetNameMappings?.[normaliseWorksheetIdentity(sourceName)]?.trim() || sourceName;
}

export function validateWorksheetNames(names: readonly string[]) {
  const issues = names.flatMap((name) => {
    const issue = validateWorksheetName(name);
    return issue ? [`${name || "Worksheet"}: ${issue}`] : [];
  });
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLocaleLowerCase("en-GB");
    if (seen.has(key)) issues.push(`Worksheet name “${name}” is duplicated.`);
    seen.add(key);
  }
  return [...new Set(issues)];
}

export function outputProfileAttentionIssues(
  profile: OutputProfileDraft,
  sourceFilename: string,
  effectiveDate: string
) {
  const issues: string[] = [];
  if (!profile.name.trim()) issues.push("Enter an Output Profile name before generating. You do not need to save the profile first.");
  if (profile.columns.length === 0) issues.push("Add at least one output column.");
  const unresolvedOutputFields = profile.columns.filter((column) => column.columnType === "SOURCE" && column.sourceColumnIndex === null).length;
  const unresolvedFilterFields = profile.filters.filter((filter) => filter.sourceColumnIndex === null).length;
  if (unresolvedOutputFields > 0) issues.push(`Match ${unresolvedOutputFields} unresolved output source ${unresolvedOutputFields === 1 ? "field" : "fields"}.`);
  if (unresolvedFilterFields > 0) issues.push(`Match ${unresolvedFilterFields} unresolved filter source ${unresolvedFilterFields === 1 ? "field" : "fields"}.`);
  const filename = resolveOutputFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate,
    outputFormat: profile.outputFormat
  });
  issues.push(...filename.errors);
  if ((profile.worksheetMode ?? "COMBINE") !== "SEPARATE_FILES" && profile.filenameTemplate.includes("{worksheet}")) {
    issues.push("The {worksheet} filename token is only available for separate worksheet files.");
  }
  if (profile.outputFormat === "XLSX") {
    const worksheetIssue = validateWorksheetName(profile.xlsxWorksheetName);
    if (worksheetIssue) issues.push(worksheetIssue);
  }
  if (profile.worksheetMode === "SEPARATE_WORKSHEETS" && profile.outputFormat !== "XLSX") {
    issues.push("Keeping source worksheets separate requires XLSX output.");
  }
  return [...new Set(issues)];
}

export function outputProfileGenerationReadiness(
  profile: OutputProfileDraft,
  sourceFilename: string,
  effectiveDate: string,
  worksheets: ReadonlyArray<{ id: string; name: string; headers: string[] }>,
  unresolvedBlockingCount = 0
) {
  const selectedWorksheetIds = profile.selectedWorksheetIds ?? [profile.sourceWorksheetId];
  const selected = worksheets.filter((worksheet) => selectedWorksheetIds.includes(worksheet.id));
  const issues = [
    ...outputProfileAttentionIssues(profile, sourceFilename, effectiveDate),
    ...(selectedWorksheetIds.length === 0 ? ["Select at least one worksheet to include."] : []),
    ...(selected.length !== selectedWorksheetIds.length ? ["One or more selected worksheets are not available."] : []),
    ...selected.flatMap((worksheet) => {
      const compatibility = resolveWorksheetCompatibility(profile, worksheet.headers);
      return compatibility.compatible ? [] : [`${worksheet.name}: ${compatibility.issues.join(" ")}`];
    }),
    ...((profile.worksheetMode ?? "COMBINE") === "COMBINE" ? [] : validateWorksheetNames(selected.map((worksheet) => configuredWorksheetName(profile, worksheet.name)))),
    ...(unresolvedBlockingCount > 0 ? [`Resolve or ignore the remaining ${unresolvedBlockingCount} blocking ${unresolvedBlockingCount === 1 ? "error" : "errors"} before generating this file.`] : [])
  ];
  return { issues: [...new Set(issues)], ready: issues.length === 0 };
}
