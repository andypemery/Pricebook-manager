import type { PrismaClient } from "@prisma/client";
import { applyReusableProfileToSource } from "@/lib/data-mapper/output-profiles/compatibility";
import type {
  AppliedOutputProfileContext,
  OutputProfileDraft,
  OutputProfileSummary,
  SaveOutputProfileInput,
  SourceWorksheetPreview
} from "@/lib/data-mapper/output-profiles/types";
import { stringArrayFromJson, stringMatrixFromJson, validateOutputProfileInput } from "@/lib/data-mapper/output-profiles/validation";
import { resolveWorksheetCompatibility } from "@/lib/data-mapper/output-profiles/worksheet-compatibility";
import { normaliseWorksheetIdentity } from "@/lib/data-mapper/output-profiles/configuration";

export class OutputProfileNotFoundError extends Error {}

export async function saveOutputProfileForTenant(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  input: SaveOutputProfileInput
) {
  const sourceWorksheet = await db.sourceWorksheet.findFirst({
    where: {
      id: input.sourceWorksheetId,
      sourceWorkbookImportId: input.sourceWorkbookImportId,
      sourceWorkbookImport: { tenantId: actor.tenantId }
    },
    select: {
      name: true,
      headers: true,
      sourceWorkbookImport: { select: { originalFileName: true, worksheets: { orderBy: { position: "asc" }, select: { name: true } } } }
    }
  });
  if (!sourceWorksheet) throw new OutputProfileNotFoundError("The selected source worksheet is not available.");

  const canonicalHeaders = stringArrayFromJson(sourceWorksheet.headers, "Source headings");
  const canonicalWorksheetNames = (sourceWorksheet.sourceWorkbookImport.worksheets ?? [])
    .map((worksheet) => worksheet.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  if (typeof sourceWorksheet.name === "string" && sourceWorksheet.name && canonicalWorksheetNames.length === 0) canonicalWorksheetNames.push(sourceWorksheet.name);
  const valid = validateOutputProfileInput(
    input,
    canonicalHeaders,
    sourceWorksheet.sourceWorkbookImport.originalFileName,
    canonicalWorksheetNames
  );
  const columnData = valid.columns.map((column, position) => ({ ...column, position }));
  const filterData = valid.filters.map((filter, position) => ({ ...filter, position }));
  const configuration = {
    name: valid.name,
    filenameTemplate: valid.filenameTemplate,
    outputFormat: valid.outputFormat,
    csvDelimiter: valid.csvDelimiter,
    csvIncludeHeader: valid.csvIncludeHeader,
    xlsxWorksheetName: valid.xlsxWorksheetName,
    worksheetMode: valid.worksheetMode,
    worksheetNameMode: valid.worksheetNameMode,
    worksheetNameMappings: valid.worksheetNameMappings,
    sourceWorkbookImportId: valid.sourceWorkbookImportId,
    sourceWorksheetId: valid.sourceWorksheetId,
    filterMatchMode: valid.filterMatchMode,
    updatedById: actor.id,
    columns: { deleteMany: {}, create: columnData },
    filters: { deleteMany: {}, create: filterData }
  };

  if (valid.id) {
    const existing = await db.outputProfile.findFirst({
      where: {
        id: valid.id,
        tenantId: actor.tenantId,
        sourceWorkbookImportId: valid.sourceWorkbookImportId,
        sourceWorksheetId: valid.sourceWorksheetId
      },
      select: { id: true }
    });
    if (!existing) throw new OutputProfileNotFoundError("The Output Profile is not available.");
    return db.outputProfile.update({
      where: { id: existing.id },
      data: configuration,
      select: { id: true, name: true, updatedAt: true }
    });
  }

  return db.outputProfile.create({
    data: {
      tenantId: actor.tenantId,
      createdById: actor.id,
      ...configuration,
      columns: { create: columnData },
      filters: { create: filterData }
    },
    select: { id: true, name: true, updatedAt: true }
  });
}

export async function listOutputProfileWorkspace(db: PrismaClient, tenantId: string) {
  const [profiles, sourceImports] = await Promise.all([
    db.outputProfile.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        outputFormat: true,
        sourceWorkbookImportId: true,
        sourceWorksheetId: true,
        updatedAt: true,
        _count: { select: { columns: true } },
        sourceWorkbookImport: { select: { originalFileName: true } },
        sourceWorksheet: { select: { name: true } }
      }
    }),
    db.sourceWorkbookImport.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFileName: true,
        validationStatus: true,
        validatedAt: true,
        worksheets: { orderBy: { position: "asc" }, select: { id: true, name: true, columnCount: true } }
      }
    })
  ]);
  return { profiles, sourceImports };
}

export async function listReusableOutputProfiles(db: PrismaClient, tenantId: string): Promise<OutputProfileSummary[]> {
  const profiles = await db.outputProfile.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      outputFormat: true,
      sourceWorkbookImportId: true,
      sourceWorksheetId: true,
      _count: { select: { columns: true } },
      sourceWorkbookImport: { select: { originalFileName: true } },
      sourceWorksheet: { select: { name: true } }
    }
  });
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    sourceWorkbookImportId: profile.sourceWorkbookImportId,
    sourceWorksheetId: profile.sourceWorksheetId,
    outputFormat: profile.outputFormat,
    outputColumnCount: profile._count.columns,
    originWorkbookFileName: profile.sourceWorkbookImport.originalFileName,
    originWorksheetName: profile.sourceWorksheet.name
  }));
}

export async function loadOutputProfileBuilder(
  db: PrismaClient,
  tenantId: string,
  selection: { profileId?: string; applyProfileId?: string; sourceWorkbookImportId?: string; sourceWorksheetId?: string }
): Promise<{ source: SourceWorksheetPreview; draft: OutputProfileDraft; application?: AppliedOutputProfileContext } | null> {
  if (selection.profileId) {
    const profile = await db.outputProfile.findFirst({
      where: { id: selection.profileId, tenantId },
      select: {
        id: true,
        name: true,
        filenameTemplate: true,
        outputFormat: true,
        csvDelimiter: true,
        csvIncludeHeader: true,
        xlsxWorksheetName: true,
        worksheetMode: true,
        worksheetNameMode: true,
        worksheetNameMappings: true,
        filterMatchMode: true,
        sourceWorkbookImportId: true,
        sourceWorksheetId: true,
        columns: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            columnType: true,
            sourceColumnIndex: true,
            sourceHeading: true,
            outputHeading: true,
            staticValue: true,
            adjustmentType: true,
            adjustmentValue: true,
            roundingDecimalPlaces: true
          }
        },
        filters: {
          orderBy: { position: "asc" },
          select: { id: true, sourceColumnIndex: true, sourceHeading: true, operator: true, comparisonValue: true }
        },
        sourceWorkbookImport: {
          select: {
            originalFileName: true,
            worksheets: { orderBy: { position: "asc" }, select: { id: true, name: true, position: true, headers: true } }
          }
        },
        sourceWorksheet: { select: { id: true, name: true, headers: true, sampleRows: true } }
      }
    });
    if (!profile) return null;
    const headers = stringArrayFromJson(profile.sourceWorksheet.headers, "Source headings");
    const sampleRows = stringMatrixFromJson(profile.sourceWorksheet.sampleRows, "Source sample rows").slice(0, 3);
    const workbookWorksheets = (profile.sourceWorkbookImport.worksheets ?? []).map((worksheet) => ({
      id: worksheet.id,
      name: worksheet.name,
      position: worksheet.position,
      headers: stringArrayFromJson(worksheet.headers, "Source headings")
    }));
    const effectiveWorksheets = workbookWorksheets.length > 0 ? workbookWorksheets : [{
      id: profile.sourceWorksheet.id,
      name: profile.sourceWorksheet.name,
      position: 0,
      headers
    }];
    const draftWithoutSelection: Omit<OutputProfileDraft, "selectedWorksheetIds"> = {
        id: profile.id,
        name: profile.name,
        filenameTemplate: profile.filenameTemplate,
        outputFormat: profile.outputFormat,
        csvDelimiter: profile.csvDelimiter,
        csvIncludeHeader: profile.csvIncludeHeader,
        xlsxWorksheetName: profile.xlsxWorksheetName ?? "",
        worksheetMode: profile.worksheetMode ?? "COMBINE",
        worksheetNameMode: profile.worksheetNameMode ?? "SOURCE",
        worksheetNameMappings: jsonStringRecord(profile.worksheetNameMappings),
        sourceWorkbookImportId: profile.sourceWorkbookImportId,
        sourceWorksheetId: profile.sourceWorksheetId,
        filterMatchMode: profile.filterMatchMode,
        columns: profile.columns.map((column) => ({
          clientId: column.id,
          columnType: column.columnType,
          sourceColumnIndex: column.sourceColumnIndex,
          sourceHeading: column.sourceHeading,
          outputHeading: column.outputHeading,
          staticValue: column.staticValue ?? "",
          adjustmentType: column.adjustmentType,
          adjustmentValue: column.adjustmentValue?.toString() ?? "",
          roundingDecimalPlaces: column.roundingDecimalPlaces as 0 | 1 | 2 | 3 | 4 | 5 | 6 | null
        })),
        filters: profile.filters.map((filter) => ({
          clientId: filter.id,
          sourceColumnIndex: filter.sourceColumnIndex,
          sourceHeading: filter.sourceHeading,
          operator: filter.operator,
          comparisonValue: filter.comparisonValue ?? ""
        }))
      };
    const draft = {
      ...draftWithoutSelection,
      selectedWorksheetIds: effectiveWorksheets
        .filter((worksheet) => resolveWorksheetCompatibility(draftWithoutSelection, worksheet.headers).compatible)
        .map((worksheet) => worksheet.id)
    } satisfies OutputProfileDraft;
    return {
      source: {
        id: profile.sourceWorksheet.id,
        sourceWorkbookImportId: profile.sourceWorkbookImportId,
        workbookFileName: profile.sourceWorkbookImport.originalFileName,
        worksheetName: profile.sourceWorksheet.name,
        headers,
        sampleRows,
        workbookWorksheets: effectiveWorksheets
      },
      draft
    };
  }

  if (!selection.sourceWorkbookImportId || !selection.sourceWorksheetId) return null;
  const [worksheet, reusableProfile] = await Promise.all([
    db.sourceWorksheet.findFirst({
      where: {
        id: selection.sourceWorksheetId,
        sourceWorkbookImportId: selection.sourceWorkbookImportId,
        sourceWorkbookImport: { tenantId }
      },
      select: {
        id: true,
        name: true,
        headers: true,
        sampleRows: true,
        sourceWorkbookImportId: true,
        sourceWorkbookImport: {
          select: {
            originalFileName: true,
            worksheets: { orderBy: { position: "asc" }, select: { id: true, name: true, position: true, headers: true } }
          }
        }
      }
    }),
    selection.applyProfileId
      ? loadOutputProfileBuilder(db, tenantId, { profileId: selection.applyProfileId })
      : Promise.resolve(null)
  ]);
  if (!worksheet) return null;
  const workbookWorksheets = (worksheet.sourceWorkbookImport.worksheets ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    position: item.position,
    headers: stringArrayFromJson(item.headers, "Source headings")
  }));
  const source = {
    id: worksheet.id,
    sourceWorkbookImportId: worksheet.sourceWorkbookImportId,
    workbookFileName: worksheet.sourceWorkbookImport.originalFileName,
    worksheetName: worksheet.name,
    headers: stringArrayFromJson(worksheet.headers, "Source headings"),
    sampleRows: stringMatrixFromJson(worksheet.sampleRows, "Source sample rows").slice(0, 3),
    workbookWorksheets: workbookWorksheets.length > 0 ? workbookWorksheets : [{
      id: worksheet.id,
      name: worksheet.name,
      position: 0,
      headers: stringArrayFromJson(worksheet.headers, "Source headings")
    }]
  } satisfies SourceWorksheetPreview;
  if (selection.applyProfileId) {
    if (!reusableProfile) return null;
    const applied = applyReusableProfileToSource({
      profile: reusableProfile.draft,
      currentSource: source,
      originWorkbookFileName: reusableProfile.source.workbookFileName,
      originWorksheetName: reusableProfile.source.worksheetName
    });
    const currentWorksheetKeys = new Set(source.workbookWorksheets.map((item) => normaliseWorksheetIdentity(item.name)));
    const currentWorksheetNameMappings = Object.fromEntries(Object.entries(applied.draft.worksheetNameMappings ?? {}).filter(([key]) => currentWorksheetKeys.has(key)));
    return {
      source,
      ...applied,
      draft: {
        ...applied.draft,
        worksheetNameMappings: currentWorksheetNameMappings,
        selectedWorksheetIds: source.workbookWorksheets
          .filter((item) => resolveWorksheetCompatibility(applied.draft, item.headers).compatible)
          .map((item) => item.id)
      }
    };
  }
  return {
    source,
    draft: {
      id: null,
      name: "",
      filenameTemplate: "{profile}_{date}",
      outputFormat: "CSV",
      csvDelimiter: "COMMA",
      csvIncludeHeader: true,
      xlsxWorksheetName: "",
      worksheetMode: "COMBINE",
      worksheetNameMode: "SOURCE",
      worksheetNameMappings: {},
      selectedWorksheetIds: source.workbookWorksheets.map((item) => item.id),
      sourceWorkbookImportId: source.sourceWorkbookImportId,
      sourceWorksheetId: source.id,
      columns: [],
      filterMatchMode: "ALL",
      filters: []
    }
  };
}

function duplicatedProfileName(name: string) {
  const suffix = " - Copy";
  return `${name.slice(0, 120 - suffix.length).trimEnd()}${suffix}`;
}

export async function duplicateOutputProfileForTenant(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  profileId: string
) {
  const profile = await db.outputProfile.findFirst({
    where: { id: profileId, tenantId: actor.tenantId },
    select: {
      name: true,
      filenameTemplate: true,
      outputFormat: true,
      csvDelimiter: true,
      csvIncludeHeader: true,
      xlsxWorksheetName: true,
      worksheetMode: true,
      worksheetNameMode: true,
      worksheetNameMappings: true,
      filterMatchMode: true,
      sourceWorkbookImportId: true,
      sourceWorksheetId: true,
      columns: {
        orderBy: { position: "asc" },
        select: {
          columnType: true,
          sourceColumnIndex: true,
          sourceHeading: true,
          outputHeading: true,
          staticValue: true,
          adjustmentType: true,
          adjustmentValue: true,
          roundingDecimalPlaces: true
        }
      },
      filters: {
        orderBy: { position: "asc" },
        select: { sourceColumnIndex: true, sourceHeading: true, operator: true, comparisonValue: true }
      }
    }
  });
  if (!profile) throw new OutputProfileNotFoundError("The Output Profile is not available.");

  return saveOutputProfileForTenant(db, actor, {
    name: duplicatedProfileName(profile.name),
    filenameTemplate: profile.filenameTemplate,
    outputFormat: profile.outputFormat,
    csvDelimiter: profile.csvDelimiter,
    csvIncludeHeader: profile.csvIncludeHeader,
    xlsxWorksheetName: profile.xlsxWorksheetName ?? "",
    worksheetMode: profile.worksheetMode ?? "COMBINE",
    worksheetNameMode: profile.worksheetNameMode ?? "SOURCE",
    worksheetNameMappings: jsonStringRecord(profile.worksheetNameMappings),
    sourceWorkbookImportId: profile.sourceWorkbookImportId,
    sourceWorksheetId: profile.sourceWorksheetId,
    columns: profile.columns.map((column) => ({
      ...column,
      staticValue: column.staticValue ?? "",
      adjustmentValue: column.adjustmentValue?.toString() ?? "",
      roundingDecimalPlaces: column.roundingDecimalPlaces as 0 | 1 | 2 | 3 | 4 | null
    })),
    filterMatchMode: profile.filterMatchMode,
    filters: profile.filters.map((filter) => ({ ...filter, comparisonValue: filter.comparisonValue ?? "" }))
  });
}

function jsonStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function deleteOutputProfileForTenant(db: PrismaClient, tenantId: string, profileId: string) {
  const profile = await db.outputProfile.findFirst({
    where: { id: profileId, tenantId },
    select: { id: true, name: true, sourceWorkbookImportId: true, sourceWorksheetId: true }
  });
  if (!profile) throw new OutputProfileNotFoundError("The Output Profile is not available.");
  await db.outputProfile.delete({ where: { id: profile.id } });
  return profile;
}
