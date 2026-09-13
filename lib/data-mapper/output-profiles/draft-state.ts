import type { OutputProfileDraft, SaveOutputProfileInput } from "@/lib/data-mapper/output-profiles/types";

export type ProfileContextIntent =
  | { type: "NEW" }
  | { type: "SWITCH"; profileId: string }
  | { type: "DUPLICATE" };

export function saveInputFromOutputProfileDraft(draft: OutputProfileDraft): SaveOutputProfileInput {
  return {
    id: draft.id,
    name: draft.name,
    filenameTemplate: draft.filenameTemplate,
    outputFormat: draft.outputFormat,
    csvDelimiter: draft.csvDelimiter,
    csvIncludeHeader: draft.csvIncludeHeader,
    xlsxWorksheetName: draft.xlsxWorksheetName,
    sourceWorkbookImportId: draft.sourceWorkbookImportId,
    sourceWorksheetId: draft.sourceWorksheetId,
    columns: draft.columns.map((column) => ({
      columnType: column.columnType,
      sourceColumnIndex: column.sourceColumnIndex,
      sourceHeading: column.sourceHeading,
      outputHeading: column.outputHeading,
      staticValue: column.staticValue,
      adjustmentType: column.adjustmentType,
      adjustmentValue: column.adjustmentValue,
      roundingDecimalPlaces: column.roundingDecimalPlaces
    })),
    filterMatchMode: draft.filterMatchMode,
    filters: draft.filters.map((filter) => ({
      sourceColumnIndex: filter.sourceColumnIndex,
      sourceHeading: filter.sourceHeading,
      operator: filter.operator,
      comparisonValue: filter.comparisonValue
    }))
  };
}

export function outputProfileDraftFingerprint(draft: OutputProfileDraft) {
  const { id: _id, ...persistedDefinition } = saveInputFromOutputProfileDraft(draft);
  return JSON.stringify(persistedDefinition);
}

export function outputProfileHasUnsavedChanges(draft: OutputProfileDraft, savedFingerprint: string) {
  return outputProfileDraftFingerprint(draft) !== savedFingerprint;
}

export function requestProfileContextChange(isDirty: boolean, intent: ProfileContextIntent) {
  return isDirty
    ? { pendingIntent: intent, approvedIntent: null }
    : { pendingIntent: null, approvedIntent: intent };
}

export function approvePendingProfileContextChange(pendingIntent: ProfileContextIntent | null) {
  return { pendingIntent: null, approvedIntent: pendingIntent };
}

export function cancelPendingProfileContextChange() {
  return { pendingIntent: null, approvedIntent: null };
}
