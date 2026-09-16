import type { OutputProfileFormat } from "@/lib/data-mapper/output-profiles/types";

export const filenameTokens = [
  "day",
  "month",
  "month_number",
  "year",
  "year_short",
  "date",
  "profile",
  "source"
] as const;

export type FilenameToken = (typeof filenameTokens)[number];

export const filenameTokenLabels: Record<FilenameToken, string> = {
  day: "Day",
  month: "Month",
  month_number: "Month number",
  year: "Year",
  year_short: "Short year",
  date: "Date",
  profile: "Profile name",
  source: "Source filename"
};

export const outputFormatExtensions: Record<OutputProfileFormat, string> = {
  CSV: ".csv",
  XLSX: ".xlsx"
};

export function defaultEffectiveDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const maximumFilenameTemplateLength = 200;
const maximumFilenameLength = 255;
const tokenPattern = /\{([^{}]+)\}/g;
const unsafeFilenameCharacters = /[<>:"/\\|?*\u0000-\u001f]/g;
const trailingKnownExtension = /\.(?:csv|xlsx)$/i;
const windowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function sourceBaseName(sourceFilename: string) {
  return sourceFilename.replace(/\.[^.]+$/, "");
}

function dateParts(effectiveDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    year: match[1],
    yearShort: match[1].slice(-2),
    monthNumber: match[2],
    day: match[3],
    monthName: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(date),
    date: effectiveDate
  };
}

function safeFilenameText(value: string) {
  return value
    .replace(unsafeFilenameCharacters, "-")
    .replace(/\.\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+/g, "")
    .replace(/[. ]+$/g, "");
}

export function cleanFilenameTemplate(value: string) {
  return value.trim().replace(trailingKnownExtension, "").trim().replace(/[. ]+$/g, "");
}

export function validateFilenameTemplate(value: unknown) {
  const errors: string[] = [];
  if (typeof value !== "string") return ["Output filename template must be text."];
  const template = cleanFilenameTemplate(value);
  if (!template) errors.push("Output filename template is required.");
  if (value.length > maximumFilenameTemplateLength) errors.push(`Output filename template must be ${maximumFilenameTemplateLength} characters or fewer.`);

  const tokenMatches = [...template.matchAll(tokenPattern)];
  for (const match of tokenMatches) {
    if (!filenameTokens.includes(match[1] as FilenameToken)) errors.push(`Filename token {${match[1]}} is not supported.`);
  }
  const withoutRecognisedShapes = template.replace(tokenPattern, "");
  if (withoutRecognisedShapes.includes("{") || withoutRecognisedShapes.includes("}")) {
    errors.push("Output filename template contains a malformed token.");
  }
  return [...new Set(errors)];
}

export function resolveOutputFilename(input: {
  filenameTemplate: unknown;
  profileName: string;
  sourceFilename: string;
  effectiveDate: string;
  outputFormat: OutputProfileFormat;
}) {
  const errors = validateFilenameTemplate(input.filenameTemplate);
  const suppliedTemplate = typeof input.filenameTemplate === "string" ? input.filenameTemplate : "";
  const warnings: string[] = [];
  const parts = dateParts(input.effectiveDate);
  if (!parts) errors.push("Effective filename date must be a valid date.");

  const tokenValues: Record<FilenameToken, string> = {
    day: parts?.day ?? "",
    month: parts?.monthName ?? "",
    month_number: parts?.monthNumber ?? "",
    year: parts?.year ?? "",
    year_short: parts?.yearShort ?? "",
    date: parts?.date ?? "",
    profile: safeFilenameText(input.profileName) || "Output Profile",
    source: safeFilenameText(sourceBaseName(input.sourceFilename)) || "Source"
  };

  const cleanTemplate = cleanFilenameTemplate(suppliedTemplate);
  const resolved = cleanTemplate.replace(tokenPattern, (match, token: string) =>
    filenameTokens.includes(token as FilenameToken) ? tokenValues[token as FilenameToken] : match
  );
  let safeBaseFilename = safeFilenameText(resolved);
  if (safeBaseFilename !== resolved.trim().replace(/[. ]+$/g, "")) {
    warnings.push("Unsafe filename characters were replaced in the preview.");
  }
  if (windowsReservedName.test(safeBaseFilename)) {
    safeBaseFilename = `_${safeBaseFilename}`;
    warnings.push("A Windows-reserved filename was adjusted in the preview.");
  }
  if (!safeBaseFilename) errors.push("Output filename resolves to an empty filename.");

  const extension = outputFormatExtensions[input.outputFormat] ?? "";
  const finalFilename = `${safeBaseFilename}${extension}`;
  if (finalFilename.length > maximumFilenameLength) errors.push(`Resolved output filename must be ${maximumFilenameLength} characters or fewer.`);

  return {
    cleanTemplate,
    safeBaseFilename,
    finalFilename,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)]
  };
}
