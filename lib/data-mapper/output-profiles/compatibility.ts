import type {
  AppliedOutputProfileContext,
  OutputProfileDraft,
  OutputProfileCompatibilityField,
  SourceWorksheetPreview
} from "@/lib/data-mapper/output-profiles/types";

export function normaliseSourceHeading(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-GB");
}

function compatibilityFields(profile: OutputProfileDraft, currentHeaders: readonly string[]) {
  const fieldsByKey = new Map<string, OutputProfileCompatibilityField>();
  const candidatesByKey = new Map<string, number[]>();

  currentHeaders.forEach((heading, index) => {
    const key = normaliseSourceHeading(heading);
    const candidates = candidatesByKey.get(key) ?? [];
    candidates.push(index);
    candidatesByKey.set(key, candidates);
  });

  function includeReference(expectedHeading: string, clientId: string, kind: "OUTPUT" | "FILTER") {
    const key = normaliseSourceHeading(expectedHeading);
    const existing = fieldsByKey.get(key);
    if (existing) {
      (kind === "OUTPUT" ? existing.outputColumnClientIds : existing.filterClientIds).push(clientId);
      return;
    }
    const candidates = candidatesByKey.get(key) ?? [];
    fieldsByKey.set(key, {
      key,
      expectedHeading,
      status: candidates.length === 1 ? "MATCHED" : candidates.length === 0 ? "MISSING" : "AMBIGUOUS",
      sourceColumnIndex: candidates.length === 1 ? candidates[0] : null,
      candidateSourceColumnIndexes: candidates,
      outputColumnClientIds: kind === "OUTPUT" ? [clientId] : [],
      filterClientIds: kind === "FILTER" ? [clientId] : []
    });
  }

  profile.columns.forEach((column) => {
    if (column.columnType === "SOURCE" && column.sourceHeading) includeReference(column.sourceHeading, column.clientId, "OUTPUT");
  });
  profile.filters.forEach((filter) => includeReference(filter.sourceHeading, filter.clientId, "FILTER"));
  return [...fieldsByKey.values()];
}

function bindDraftToFields(
  profile: OutputProfileDraft,
  currentSource: SourceWorksheetPreview,
  fields: readonly OutputProfileCompatibilityField[]
): OutputProfileDraft {
  const fieldByOutputColumn = new Map(fields.flatMap((field) => field.outputColumnClientIds.map((clientId) => [clientId, field] as const)));
  const fieldByFilter = new Map(fields.flatMap((field) => field.filterClientIds.map((clientId) => [clientId, field] as const)));
  return {
    ...profile,
    id: null,
    sourceWorkbookImportId: currentSource.sourceWorkbookImportId,
    sourceWorksheetId: currentSource.id,
    columns: profile.columns.map((column) => {
      const field = fieldByOutputColumn.get(column.clientId);
      if (!field) return { ...column };
      const sourceColumnIndex = field.sourceColumnIndex;
      return {
        ...column,
        sourceColumnIndex,
        sourceHeading: sourceColumnIndex === null ? field.expectedHeading : currentSource.headers[sourceColumnIndex]
      };
    }),
    filters: profile.filters.map((filter) => {
      const field = fieldByFilter.get(filter.clientId);
      if (!field) return { ...filter };
      const sourceColumnIndex = field.sourceColumnIndex;
      return {
        ...filter,
        sourceColumnIndex,
        sourceHeading: sourceColumnIndex === null ? field.expectedHeading : currentSource.headers[sourceColumnIndex]
      };
    })
  };
}

export function applyReusableProfileToSource(input: {
  profile: OutputProfileDraft;
  currentSource: SourceWorksheetPreview;
  originWorkbookFileName: string;
  originWorksheetName: string;
}) {
  const fields = compatibilityFields(input.profile, input.currentSource.headers);
  const matchedFieldCount = fields.filter((field) => field.sourceColumnIndex !== null).length;
  return {
    draft: bindDraftToFields(input.profile, input.currentSource, fields),
    application: {
      profileId: input.profile.id ?? "",
      profileName: input.profile.name,
      originWorkbookFileName: input.originWorkbookFileName,
      originWorksheetName: input.originWorksheetName,
      requiredFieldCount: fields.length,
      matchedFieldCount,
      fields
    } satisfies AppliedOutputProfileContext
  };
}

export function manuallyResolveProfileField(input: {
  draft: OutputProfileDraft;
  application: AppliedOutputProfileContext;
  fieldKey: string;
  sourceColumnIndex: number;
  currentHeaders: readonly string[];
}) {
  if (!Number.isInteger(input.sourceColumnIndex) || input.sourceColumnIndex < 0 || input.sourceColumnIndex >= input.currentHeaders.length) {
    throw new Error("The selected current-source column does not exist.");
  }
  const selectedField = input.application.fields.find((field) => field.key === input.fieldKey);
  if (!selectedField) throw new Error("The profile field is not available for matching.");
  const sourceHeading = input.currentHeaders[input.sourceColumnIndex];
  const outputIds = new Set(selectedField.outputColumnClientIds);
  const filterIds = new Set(selectedField.filterClientIds);
  const fields = input.application.fields.map((field) => field.key === input.fieldKey ? {
    ...field,
    status: "MANUAL" as const,
    sourceColumnIndex: input.sourceColumnIndex
  } : field);
  return {
    draft: {
      ...input.draft,
      columns: input.draft.columns.map((column) => outputIds.has(column.clientId) ? { ...column, sourceColumnIndex: input.sourceColumnIndex, sourceHeading } : column),
      filters: input.draft.filters.map((filter) => filterIds.has(filter.clientId) ? { ...filter, sourceColumnIndex: input.sourceColumnIndex, sourceHeading } : filter)
    },
    application: {
      ...input.application,
      fields,
      matchedFieldCount: fields.filter((field) => field.sourceColumnIndex !== null).length
    }
  };
}
