"use client";

import { useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, GripVertical, Plus, Save } from "lucide-react";
import { OutputColumnInspector } from "@/components/data-mapper/output-column-inspector";
import { OutputProfileFilters } from "@/components/data-mapper/output-profile-filters";
import { OutputProfileManager } from "@/components/data-mapper/output-profile-manager";
import { OutputProfileSettings } from "@/components/data-mapper/output-profile-settings";
import { useUnsavedProfileProtection } from "@/components/data-mapper/use-unsaved-profile-protection";
import { saveOutputProfileAction } from "@/lib/actions/output-profile.actions";
import {
  outputProfileDraftFingerprint,
  outputProfileHasUnsavedChanges,
  saveInputFromOutputProfileDraft
} from "@/lib/data-mapper/output-profiles/draft-state";
import {
  addFilter,
  addSourceColumn,
  addStaticColumn,
  mappedSourceColumnIndexes,
  moveFilter,
  moveOutputColumn,
  removeFilter,
  removeOutputColumn,
  updateFilter,
  updateOutputColumn
} from "@/lib/data-mapper/output-profiles/profile-state";
import { buildOutputPreview, describeColumnRule } from "@/lib/data-mapper/output-profiles/rules";
import type { OutputProfileColumnDraft, OutputProfileDraft, OutputProfileSummary, SourceWorksheetPreview } from "@/lib/data-mapper/output-profiles/types";

const sourceDragType = "application/x-pricebook-source-column";
const outputDragType = "application/x-pricebook-output-column";

function newClientId() {
  return crypto.randomUUID();
}

export function OutputProfileBuilder({ source, initialDraft, profiles, initialEffectiveDate, canEdit }: {
  source: SourceWorksheetPreview;
  initialDraft: OutputProfileDraft;
  profiles: OutputProfileSummary[];
  initialEffectiveDate: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const profileNameInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [savedFingerprint, setSavedFingerprint] = useState(() => outputProfileDraftFingerprint(initialDraft));
  const [effectiveDate, setEffectiveDate] = useState(initialEffectiveDate);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(initialDraft.columns[0]?.clientId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const canInteract = canEdit && !isSaving;
  const usedSourceIndexes = useMemo(() => mappedSourceColumnIndexes(draft.columns), [draft.columns]);
  const preview = useMemo(
    () => buildOutputPreview(draft.columns, source.sampleRows, draft.filters, draft.filterMatchMode),
    [draft.columns, draft.filterMatchMode, draft.filters, source.sampleRows]
  );
  const isDirty = useMemo(() => outputProfileHasUnsavedChanges(draft, savedFingerprint), [draft, savedFingerprint]);
  useUnsavedProfileProtection(isDirty);
  const selectedColumnIndex = draft.columns.findIndex((column) => column.clientId === selectedColumnId);
  const selectedColumn = selectedColumnIndex >= 0 ? draft.columns[selectedColumnIndex] : null;

  function resetSaveState() {
    setMessage(null);
    setError(null);
  }

  function addColumn(sourceColumnIndex: number, targetIndex = draft.columns.length) {
    if (!canInteract) return;
    const sourceHeading = source.headers[sourceColumnIndex];
    if (sourceHeading === undefined) return;
    const clientId = newClientId();
    setDraft((current) => {
      const appended = addSourceColumn(current.columns, { sourceColumnIndex, sourceHeading }, clientId);
      return { ...current, columns: targetIndex === current.columns.length ? appended : moveOutputColumn(appended, clientId, targetIndex) };
    });
    setSelectedColumnId(clientId);
    resetSaveState();
  }

  function addFixedColumn() {
    if (!canInteract) return;
    const clientId = newClientId();
    setDraft((current) => ({ ...current, columns: addStaticColumn(current.columns, clientId) }));
    setSelectedColumnId(clientId);
    resetSaveState();
  }

  function moveColumn(clientId: string, targetIndex: number) {
    if (!canInteract) return;
    setDraft((current) => ({ ...current, columns: moveOutputColumn(current.columns, clientId, targetIndex) }));
    setMessage(null);
  }

  function removeColumn(clientId: string) {
    if (!canInteract) return;
    setDraft((current) => ({ ...current, columns: removeOutputColumn(current.columns, clientId) }));
    setSelectedColumnId(null);
    resetSaveState();
  }

  function dropIntoOutput(event: DragEvent<HTMLElement>, targetIndex: number) {
    event.preventDefault();
    const sourceIndexText = event.dataTransfer.getData(sourceDragType);
    if (sourceIndexText) {
      addColumn(Number(sourceIndexText), targetIndex);
      return;
    }
    const clientId = event.dataTransfer.getData(outputDragType);
    if (clientId) moveColumn(clientId, Math.min(targetIndex, Math.max(0, draft.columns.length - 1)));
  }

  function addProfileFilter() {
    if (!canInteract || source.headers.length === 0) return;
    setDraft((current) => ({
      ...current,
      filters: addFilter(current.filters, { sourceColumnIndex: 0, sourceHeading: source.headers[0] }, newClientId())
    }));
    resetSaveState();
  }

  function saveProfile() {
    if (!canEdit || isSaving) return;
    const submittedDraft = draft;
    const submittedFingerprint = outputProfileDraftFingerprint(submittedDraft);
    resetSaveState();
    startSaving(async () => {
      const result = await saveOutputProfileAction(saveInputFromOutputProfileDraft(submittedDraft));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedFingerprint(submittedFingerprint);
      setDraft((current) => ({ ...current, id: result.profileId }));
      setMessage(result.message);
      router.replace(`/mapping?profile=${encodeURIComponent(result.profileId)}`);
      router.refresh();
    });
  }

  function updateSelectedColumn(changes: Partial<Omit<OutputProfileColumnDraft, "clientId" | "columnType" | "sourceColumnIndex" | "sourceHeading">>) {
    if (!selectedColumn) return;
    setDraft((current) => ({ ...current, columns: updateOutputColumn(current.columns, selectedColumn.clientId, changes) }));
    resetSaveState();
  }

  return (
    <section className="outputProfileBuilder" aria-label="Output Profile Builder">
      <OutputProfileManager
        profiles={profiles}
        activeProfileId={draft.id}
        sourceWorkbookImportId={draft.sourceWorkbookImportId}
        sourceWorksheetId={draft.sourceWorksheetId}
        currentProfileName={draft.name}
        isDirty={isDirty}
        canEdit={canEdit}
        isBusy={isSaving}
        onRename={() => { profileNameInput.current?.focus(); profileNameInput.current?.select(); }}
      />

      <div className="card outputProfileIdentity">
        <label className="field">
          <span>Output Profile name</span>
          <input ref={profileNameInput} value={draft.name} onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); resetSaveState(); }} placeholder="For example, NHS Contract" maxLength={120} disabled={!canInteract} />
        </label>
        <div className="outputProfileSaveArea">
          {isDirty ? <span className="unsavedIndicator" role="status">Unsaved changes</span> : null}
          {message ? <span className="success" role="status">{message}</span> : null}
          {error ? <span className="error" role="alert">{error}</span> : null}
          {canEdit ? (
            <button className="primary" type="button" onClick={saveProfile} disabled={isSaving || (draft.id !== null && !isDirty)}>
              <Save aria-hidden="true" size={18} /> {isSaving ? "Saving" : draft.id ? "Save changes" : "Save draft"}
            </button>
          ) : <span className="badge">Read-only access</span>}
        </div>
      </div>

      <section className="card spreadsheetCard" aria-labelledby="source-sheet-title">
        <div className="sheetHeader">
          <div>
            <p className="sheetLabel">Source sheet</p>
            <h2 id="source-sheet-title">{source.workbookFileName}</h2>
            <p className="muted">Worksheet: {source.worksheetName} · Drag a heading or use Add. Used fields remain available for reuse.</p>
          </div>
          <span className="badge">3-row preview</span>
        </div>
        <div className="outputSheetScroll">
          <table className="builderSheet sourceBuilderSheet">
            <thead>
              <tr>
                {source.headers.map((heading, sourceColumnIndex) => {
                  const used = usedSourceIndexes.has(sourceColumnIndex);
                  return (
                    <th className={used ? "sourceHeadingCell used" : "sourceHeadingCell"} draggable={canInteract} key={`${heading}-${sourceColumnIndex}`} onDragEnd={() => setIsDragging(false)} onDragStart={(event) => {
                      event.dataTransfer.setData(sourceDragType, String(sourceColumnIndex));
                      event.dataTransfer.effectAllowed = "copy";
                      setIsDragging(true);
                    }}>
                      <div className="sourceHeadingContent">
                        <span>{heading}</span>
                        {used ? <span className="mappedMarker"><Check aria-hidden="true" size={13} /> Used</span> : null}
                      </div>
                      {canInteract ? <button className="sheetIconButton" type="button" onClick={() => addColumn(sourceColumnIndex)} aria-label={`Add ${heading} to output`}><Plus aria-hidden="true" size={15} /></button> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {source.sampleRows.map((row, rowIndex) => <tr key={rowIndex}>{source.headers.map((heading, columnIndex) => <td key={`${heading}-${columnIndex}`}>{row[columnIndex] ?? ""}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sheetDirection" aria-hidden="true"><span>Drag headings down</span></div>

      <section className="card spreadsheetCard outputSpreadsheetCard" aria-labelledby="output-sheet-title">
        <div className="sheetHeader">
          <div>
            <p className="sheetLabel">Output sheet</p>
            <h2 id="output-sheet-title">{draft.name.trim() || "Untitled Output Profile"}</h2>
            <p className="muted">Arrange fields, select a heading to rename or configure it, then add fixed values and filters if needed.</p>
          </div>
          <div className="sheetHeaderActions">
            <span className="badge">{draft.columns.length} columns</span>
            {canInteract ? <button className="secondary" type="button" onClick={addFixedColumn}><Plus aria-hidden="true" size={16} /> Add fixed column</button> : null}
          </div>
        </div>
        <div className={`${draft.columns.length === 0 ? "outputSheetScroll emptyOutputDropzone" : "outputSheetScroll"}${isDragging ? " dragTargetActive" : ""}`} onDragOver={(event) => { if (canInteract) event.preventDefault(); }} onDrop={(event) => { setIsDragging(false); dropIntoOutput(event, draft.columns.length); }}>
          {draft.columns.length > 0 ? (
            <table className="builderSheet outputBuilderSheet">
              <thead>
                <tr>
                  {draft.columns.map((column, index) => {
                    const customised = column.columnType === "SOURCE" && column.outputHeading !== column.sourceHeading;
                    const ruleDescription = describeColumnRule(column);
                    return (
                      <th className={`${selectedColumnId === column.clientId ? "outputHeadingCell selected" : "outputHeadingCell"}${customised || column.columnType === "STATIC" ? " customised" : ""}`} draggable={canInteract} key={column.clientId} onDragEnd={() => setIsDragging(false)} onDragOver={(event) => { if (canInteract) event.preventDefault(); }} onDrop={(event) => { event.stopPropagation(); setIsDragging(false); dropIntoOutput(event, index); }} onDragStart={(event) => {
                        event.dataTransfer.setData(outputDragType, column.clientId);
                        event.dataTransfer.effectAllowed = "move";
                        setIsDragging(true);
                      }}>
                        <button className="outputHeadingButton" type="button" onClick={() => setSelectedColumnId(column.clientId)}>
                          <GripVertical aria-hidden="true" size={15} />
                          <span>
                            <strong>{column.outputHeading || "Untitled column"}</strong>
                            <small>{column.columnType === "STATIC" ? "Fixed value" : `from ${column.sourceHeading}`}</small>
                            {ruleDescription ? <small className="columnRuleSummary">{ruleDescription}</small> : null}
                          </span>
                          {column.columnType === "STATIC" ? <span className="customisedMarker">Fixed</span> : customised ? <span className="customisedMarker">Customised</span> : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.outputRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={`${draft.columns[columnIndex].clientId}-${rowIndex}`}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
          ) : (
            <div className="emptyOutputMessage"><Plus aria-hidden="true" size={24} /><strong>Drop a source heading here</strong><span>Or add a fixed column for values such as CURRENCY or CONTRACT.</span></div>
          )}
        </div>

        {draft.filters.length > 0 && preview.matchingSourceRows.length === 0 ? (
          <div className="emptyFilteredPreview" role="status">
            <strong>No rows in the current 3-row sample match these filters.</strong>
            <span>Full matching results will be determined when the output is generated.</span>
          </div>
        ) : null}

        {preview.negativeAdjustedSample ? (
          <div className="negativeSampleWarning" role="status">
            <strong>This adjustment produces negative values in the current sample.</strong>
            <span>This warning is based only on the compact three-row preview.</span>
          </div>
        ) : null}

        {selectedColumn ? (
          <OutputColumnInspector
            column={selectedColumn}
            columnIndex={selectedColumnIndex}
            columnCount={draft.columns.length}
            canEdit={canInteract}
            onChange={updateSelectedColumn}
            onMove={(targetIndex) => moveColumn(selectedColumn.clientId, targetIndex)}
            onRemove={() => removeColumn(selectedColumn.clientId)}
          />
        ) : null}
      </section>

      <OutputProfileFilters
        headers={source.headers}
        filters={draft.filters}
        matchMode={draft.filterMatchMode}
        canEdit={canInteract}
        onAdd={addProfileFilter}
        onChange={(clientId, changes) => { setDraft((current) => ({ ...current, filters: updateFilter(current.filters, clientId, changes) })); resetSaveState(); }}
        onMove={(clientId, targetIndex) => { setDraft((current) => ({ ...current, filters: moveFilter(current.filters, clientId, targetIndex) })); setMessage(null); }}
        onRemove={(clientId) => { setDraft((current) => ({ ...current, filters: removeFilter(current.filters, clientId) })); resetSaveState(); }}
        onMatchModeChange={(filterMatchMode) => { setDraft((current) => ({ ...current, filterMatchMode })); resetSaveState(); }}
      />

      <OutputProfileSettings
        profile={draft}
        sourceFilename={source.workbookFileName}
        effectiveDate={effectiveDate}
        canEdit={canInteract}
        onChange={(changes) => { setDraft((current) => ({ ...current, ...changes })); resetSaveState(); }}
        onEffectiveDateChange={setEffectiveDate}
      />
    </section>
  );
}
