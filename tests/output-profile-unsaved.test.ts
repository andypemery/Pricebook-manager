import { describe, expect, it, vi } from "vitest";
import {
  approvePendingProfileContextChange,
  cancelPendingProfileContextChange,
  outputProfileDraftFingerprint,
  outputProfileHasUnsavedChanges,
  requestProfileContextChange,
  saveInputFromOutputProfileDraft,
  type ProfileContextIntent
} from "../lib/data-mapper/output-profiles/draft-state";
import {
  protectBeforeUnload,
  shouldConfirmInAppNavigation,
  shouldRegisterUnsavedProtection
} from "../components/data-mapper/use-unsaved-profile-protection";
import type { OutputProfileDraft } from "../lib/data-mapper/output-profiles/types";
import { moveOutputColumn, removeOutputColumn } from "../lib/data-mapper/output-profiles/profile-state";

function draft(overrides: Partial<OutputProfileDraft> = {}): OutputProfileDraft {
  return {
    id: "profile-1",
    name: "NHS Contract",
    filenameTemplate: "NHS_{month}_{year}",
    outputFormat: "CSV",
    csvDelimiter: "COMMA",
    csvIncludeHeader: true,
    xlsxWorksheetName: "",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [{
      clientId: "column-1",
      columnType: "SOURCE",
      sourceColumnIndex: 0,
      sourceHeading: "Product Code",
      outputHeading: "MATERIAL",
      staticValue: "",
      adjustmentType: "NONE",
      adjustmentValue: "",
      roundingDecimalPlaces: null
    }],
    filterMatchMode: "ALL",
    filters: [],
    ...overrides
  };
}

describe("Output Profile unsaved-change protection", () => {
  it("starts clean, becomes dirty after an edit and becomes clean when reverted", () => {
    const initial = draft();
    const baseline = outputProfileDraftFingerprint(initial);
    const edited = { ...initial, name: "Education Contract" };

    expect(outputProfileHasUnsavedChanges(initial, baseline)).toBe(false);
    expect(outputProfileHasUnsavedChanges(edited, baseline)).toBe(true);
    expect(outputProfileHasUnsavedChanges({ ...edited, name: initial.name }, baseline)).toBe(false);
  });

  it("ignores client-only IDs while tracking every persisted setting", () => {
    const initial = draft();
    const baseline = outputProfileDraftFingerprint(initial);
    const newClientIds = {
      ...initial,
      id: "another-persisted-id",
      columns: initial.columns.map((column) => ({ ...column, clientId: "another-client-id" }))
    };

    expect(outputProfileHasUnsavedChanges(newClientIds, baseline)).toBe(false);
    expect(outputProfileHasUnsavedChanges({ ...initial, csvDelimiter: "PIPE" }, baseline)).toBe(true);
    expect(saveInputFromOutputProfileDraft(initial)).not.toHaveProperty("effectiveDate");
  });

  it("successful save establishes the submitted state as the new clean baseline", () => {
    const edited = { ...draft(), filenameTemplate: "NHS_{date}" };
    const savedBaseline = outputProfileDraftFingerprint(edited);

    expect(outputProfileHasUnsavedChanges(edited, savedBaseline)).toBe(false);
  });

  it("failed save preserves the previous baseline and leaves edits dirty", () => {
    const initial = draft();
    const baseline = outputProfileDraftFingerprint(initial);
    const edited = { ...initial, filenameTemplate: "NHS_{date}" };

    expect(outputProfileHasUnsavedChanges(edited, baseline)).toBe(true);
  });

  it("marks arrow moves and column deletion dirty while preserving clean saved order", () => {
    const initial = draft({
      columns: [
        ...draft().columns,
        { ...draft().columns[0], clientId: "column-2", sourceColumnIndex: 1, sourceHeading: "Description", outputHeading: "DESCRIPTION" }
      ]
    });
    const baseline = outputProfileDraftFingerprint(initial);
    const moved = { ...initial, columns: moveOutputColumn(initial.columns, "column-2", 0) };
    const removed = { ...initial, columns: removeOutputColumn(initial.columns, "column-1") };

    expect(outputProfileHasUnsavedChanges(moved, baseline)).toBe(true);
    expect(outputProfileHasUnsavedChanges(removed, baseline)).toBe(true);
    expect(outputProfileHasUnsavedChanges(initial, baseline)).toBe(false);
  });

  it("allows immediate clean switching but requires confirmation for dirty switching", () => {
    const intent: ProfileContextIntent = { type: "SWITCH", profileId: "profile-2" };

    expect(requestProfileContextChange(false, intent)).toEqual({ pendingIntent: null, approvedIntent: intent });
    expect(requestProfileContextChange(true, intent)).toEqual({ pendingIntent: intent, approvedIntent: null });
  });

  it("supports staying put or explicitly discarding before the requested switch", () => {
    const intent: ProfileContextIntent = { type: "SWITCH", profileId: "profile-2" };

    expect(cancelPendingProfileContextChange()).toEqual({ pendingIntent: null, approvedIntent: null });
    expect(approvePendingProfileContextChange(intent)).toEqual({ pendingIntent: null, approvedIntent: intent });
  });

  it("does not allow New or Duplicate to silently replace a dirty context", () => {
    expect(requestProfileContextChange(true, { type: "NEW" })).toEqual({ pendingIntent: { type: "NEW" }, approvedIntent: null });
    expect(requestProfileContextChange(true, { type: "DUPLICATE" })).toEqual({ pendingIntent: { type: "DUPLICATE" }, approvedIntent: null });
  });

  it("activates standard unload protection only while dirty", () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: "unchanged" };

    expect(shouldRegisterUnsavedProtection(false)).toBe(false);
    expect(shouldRegisterUnsavedProtection(true)).toBe(true);
    protectBeforeUnload(event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });

  it("protects same-tab in-app navigation but ignores harmless links and clean state", () => {
    const navigation = {
      currentHref: "https://example.test/mapping?profile=one",
      targetHref: "https://example.test/workbook",
      opensNewContext: false,
      modifiedClick: false
    };

    expect(shouldConfirmInAppNavigation({ ...navigation, isDirty: true })).toBe(true);
    expect(shouldConfirmInAppNavigation({ ...navigation, isDirty: false })).toBe(false);
    expect(shouldConfirmInAppNavigation({ ...navigation, isDirty: true, opensNewContext: true })).toBe(false);
    expect(shouldConfirmInAppNavigation({ ...navigation, isDirty: true, targetHref: "https://example.test/mapping?profile=one#output" })).toBe(false);
    expect(shouldConfirmInAppNavigation({ ...navigation, isDirty: true, targetHref: "https://other.test/workbook" })).toBe(false);
  });
});
