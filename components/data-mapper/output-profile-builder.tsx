"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { OutputColumnInspector } from "@/components/data-mapper/output-column-inspector";
import { OutputProfileFilters } from "@/components/data-mapper/output-profile-filters";
import { OutputProfileManager } from "@/components/data-mapper/output-profile-manager";
import { OutputProfileSettings } from "@/components/data-mapper/output-profile-settings";
import { OutputProfileWorksheets } from "@/components/data-mapper/output-profile-worksheets";
import { OutputGenerationPanel } from "@/components/data-mapper/output-generation-panel";
import { useUnsavedProfileProtection } from "@/components/data-mapper/use-unsaved-profile-protection";
import { useHorizontalPan } from "@/components/data-mapper/use-horizontal-pan";
import { saveOutputProfileAction, saveOutputProfileAsNewAction } from "@/lib/actions/output-profile.actions";
import { manuallyResolveProfileField } from "@/lib/data-mapper/output-profiles/compatibility";
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
  outputColumnTargetIndex,
  removeFilter,
  removeOutputColumn,
  updateFilter,
  updateOutputColumn
} from "@/lib/data-mapper/output-profiles/profile-state";
import { buildOutputPreview, describeColumnRule } from "@/lib/data-mapper/output-profiles/rules";
import type {
  AppliedOutputProfileContext,
  OutputProfileColumnDraft,
  OutputProfileDraft,
  OutputProfileSummary,
  SourceWorksheetPreview
} from "@/lib/data-mapper/output-profiles/types";

const sourceDragType = "application/x-pricebook-source-column";
const outputDragType = "application/x-pricebook-output-column";

function newClientId() {
  return crypto.randomUUID();
}

export function outputHeadingInsertionClassName(
  selected: boolean,
  customised: boolean,
  insertionIndex: number | null,
  columnIndex: number,
  columnCount: number
) {
  const classes = ["outputHeadingCell"];
  if (selected) classes.push("selected");
  if (customised) classes.push("customised");
  if (insertionIndex === columnIndex) classes.push("insertionBefore");
  if (insertionIndex === columnCount && columnIndex === columnCount - 1) classes.push("insertionAfter");
  return classes.join(" ");
}

export function OutputProfileBuilder({ source, initialDraft, profiles, initialApplication, initialEffectiveDate, canEdit, projectId, projectName }: {
  source: SourceWorksheetPreview;
  initialDraft: OutputProfileDraft;
  profiles: OutputProfileSummary[];
  initialApplication?: AppliedOutputProfileContext | null;
  initialEffectiveDate: string;
  canEdit: boolean;
  projectId?: string;
  projectName?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [application, setApplication] = useState(initialApplication ?? null);
  const [savedFingerprint, setSavedFingerprint] = useState(() => outputProfileDraftFingerprint(initialDraft));
  const [filenameDate, setFilenameDate] = useState(initialEffectiveDate);
  const [dragState, setDragState] = useState<{ kind: "source" } | { kind: "output"; clientId: string } | null>(null);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [addColumnMode, setAddColumnMode] = useState<"CHOICES" | "SOURCE" | null>(null);
  const [sourceColumnToAdd, setSourceColumnToAdd] = useState(0);
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
  const isDragging = dragState !== null;
  const unresolvedCompatibilityFields = application?.fields.filter((field) => field.sourceColumnIndex === null) ?? [];
  const sourceSheetPan = useHorizontalPan<HTMLDivElement>();
  const outputSheetPan = useHorizontalPan<HTMLDivElement>();

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
      return { ...current, columns: addSourceColumn(current.columns, { sourceColumnIndex, sourceHeading }, clientId, targetIndex) };
    });
    setSelectedColumnId(clientId);
    resetSaveState();
  }

  function addFixedColumn() {
    if (!canInteract) return;
    const clientId = newClientId();
    setDraft((current) => ({ ...current, columns: addStaticColumn(current.columns, clientId) }));
    setSelectedColumnId(clientId);
    setAddColumnMode(null);
    resetSaveState();
  }

  function addChosenSourceColumn() {
    addColumn(sourceColumnToAdd);
    setAddColumnMode(null);
  }

  function moveColumn(clientId: string, targetIndex: number) {
    if (!canInteract) return;
    setDraft((current) => ({ ...current, columns: moveOutputColumn(current.columns, clientId, targetIndex) }));
    setMessage(null);
  }

  function removeColumn(clientId: string) {
    if (!canInteract) return;
    const removedIndex = draft.columns.findIndex((column) => column.clientId === clientId);
    const remaining = removeOutputColumn(draft.columns, clientId);
    setDraft((current) => ({ ...current, columns: removeOutputColumn(current.columns, clientId) }));
    if (selectedColumnId === clientId) setSelectedColumnId(remaining[Math.min(removedIndex, remaining.length - 1)]?.clientId ?? null);
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
    if (clientId) {
      const target = outputColumnTargetIndex(draft.columns, clientId, targetIndex);
      if (target >= 0) moveColumn(clientId, target);
    }
  }

  function finishDrag() {
    setDragState(null);
    setInsertionIndex(null);
  }

  function updateInsertionFromColumn(event: DragEvent<HTMLElement>, columnIndex: number) {
    if (!canInteract) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setInsertionIndex(event.clientX < bounds.left + bounds.width / 2 ? columnIndex : columnIndex + 1);
  }

  function dropAtInsertion(event: DragEvent<HTMLElement>, targetIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    dropIntoOutput(event, targetIndex);
    finishDrag();
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
      const result = await saveOutputProfileAction({ ...saveInputFromOutputProfileDraft(submittedDraft), projectId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedFingerprint(submittedFingerprint);
      setDraft((current) => ({ ...current, id: result.profileId }));
      setApplication(null);
      setMessage(result.message);
      router.replace(projectId ? `/mapping?project=${encodeURIComponent(projectId)}&apply=${encodeURIComponent(result.profileId)}&source=${encodeURIComponent(source.sourceWorkbookImportId)}&worksheet=${encodeURIComponent(source.id)}` : `/mapping?profile=${encodeURIComponent(result.profileId)}`);
      router.refresh();
    });
  }

  function saveProfileAsNew(name: string) {
    if (!canEdit || isSaving || !draft.id || projectId) return;
    const originalProfileId = draft.id;
    const submittedDraft = { ...draft, id: null, name };
    resetSaveState();
    startSaving(async () => {
      const result = await saveOutputProfileAsNewAction(originalProfileId, saveInputFromOutputProfileDraft(submittedDraft));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const savedDraft = { ...submittedDraft, id: result.profileId };
      setDraft(savedDraft);
      setSavedFingerprint(outputProfileDraftFingerprint(savedDraft));
      setApplication(null);
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

  function resolveCompatibilityField(fieldKey: string, sourceColumnIndex: number) {
    if (!application) return;
    const resolved = manuallyResolveProfileField({ draft, application, fieldKey, sourceColumnIndex, currentHeaders: source.headers });
    setDraft(resolved.draft);
    setApplication(resolved.application);
    resetSaveState();
  }

  return (
    <section className="outputProfileBuilder" aria-label="Output Profile Builder">
      {projectId ? <p className="builderProjectContext">Project: <strong>{projectName}</strong></p> : null}
      <OutputProfileManager
        profiles={profiles}
        activeProfileId={draft.id}
        appliedProfileId={application?.profileId ?? null}
        sourceWorkbookImportId={draft.sourceWorkbookImportId}
        sourceWorksheetId={draft.sourceWorksheetId}
        sourceFilename={source.workbookFileName}
        sourceWorksheetName={source.worksheetName}
        currentProfileName={draft.name}
        isDirty={isDirty}
        canEdit={canEdit}
        projectId={projectId}
        projectName={projectName}
        isBusy={isSaving}
        saveMessage={message}
        saveError={error}
        saveLabel={isSaving ? "Saving" : draft.id ? "Save changes" : application ? "Save as new profile" : "Save draft"}
        saveDisabled={isSaving || ((draft.id !== null || application !== null) && !isDirty)}
        onNameChange={(name) => { setDraft((current) => ({ ...current, name })); resetSaveState(); }}
        onSave={saveProfile}
        onSaveAsNew={saveProfileAsNew}
      />

      {application ? (
        <section className="card profileCompatibility" aria-labelledby="profile-compatibility-title">
          <div className="sectionHeader">
            <div>
              <p className="sheetLabel">Applied saved profile</p>
              <h2 id="profile-compatibility-title">{application.profileName}</h2>
              <p className="muted">Originally created from {application.originWorkbookFileName} · {application.originWorksheetName}. The saved profile remains unchanged.</p>
            </div>
            <span className={unresolvedCompatibilityFields.length === 0 ? "badge success" : "badge warning"}>
              {unresolvedCompatibilityFields.length === 0 ? "Compatible" : "Needs attention"}
            </span>
          </div>
          <p className="profileCompatibilitySummary">
            {unresolvedCompatibilityFields.length === 0
              ? `All ${application.requiredFieldCount} required source ${application.requiredFieldCount === 1 ? "field was" : "fields were"} found.`
              : `${application.matchedFieldCount} of ${application.requiredFieldCount} source fields matched automatically. ${unresolvedCompatibilityFields.length} ${unresolvedCompatibilityFields.length === 1 ? "needs" : "need"} your attention.`}
          </p>
          {unresolvedCompatibilityFields.length > 0 ? (
            <div className="profileCompatibilityFields">
              {unresolvedCompatibilityFields.map((field) => (
                <label className="field profileCompatibilityField" key={field.key}>
                  <span>Expected by profile: {field.expectedHeading}</span>
                  <small>{field.status === "AMBIGUOUS" ? "More than one current heading matches. Choose the intended occurrence." : "No exact current heading was found. Choose a source column explicitly."}</small>
                  <select value="" onChange={(event) => {
                    if (event.target.value !== "") resolveCompatibilityField(field.key, Number(event.target.value));
                  }} disabled={!canInteract}>
                    <option value="">Choose current source column</option>
                    {source.headers.map((heading, index) => <option value={index} key={`${heading}-${index}`}>Column {index + 1} · {heading}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}


      <nav className="outputStageNavigation" aria-label="Output Profile stages">
        <a href="#build-output"><span>1</span>Build Output</a>
        <span aria-hidden="true">·</span>
        <a href="#rules-output"><span>2</span>Rules &amp; Output</a>
        <span aria-hidden="true">·</span>
        <a href="#worksheets"><span>3</span>Worksheets</a>
        <span aria-hidden="true">·</span>
        <a href="#generate"><span>4</span>Generate</a>
      </nav>

      <section className="outputWorkflowStage buildOutputStage" id="build-output" aria-labelledby="build-output-title">
        <div className="workflowStageHeader"><span>1</span><div><h2 id="build-output-title">Build Output</h2><p className="muted">Choose source fields and shape the output columns.</p></div></div>

      <section className="card spreadsheetCard" aria-labelledby="source-sheet-title">
        <div className="sheetHeader">
          <div>
            <p className="sheetLabel">Source tray</p>
            <h2 id="source-sheet-title">Source Columns</h2>
            <p className="muted">Drag a heading into the output or use Add column. Used fields remain available.</p>
          </div>
          <span className="badge">3-row preview</span>
        </div>
        <div {...sourceSheetPan.handlers} aria-label="Source Sheet horizontal preview" className={`outputSheetScroll horizontalPanSurface${sourceSheetPan.isPanning ? " isPanning" : ""}`} tabIndex={0}>
          <table className="builderSheet sourceBuilderSheet">
            <thead>
              <tr>
                {source.headers.map((heading, sourceColumnIndex) => {
                  const used = usedSourceIndexes.has(sourceColumnIndex);
                  return (
                    <th className={used ? "sourceHeadingCell used" : "sourceHeadingCell"} draggable={canInteract} key={`${heading}-${sourceColumnIndex}`} onDragEnd={finishDrag} onDragStart={(event) => {
                      event.dataTransfer.setData(sourceDragType, String(sourceColumnIndex));
                      event.dataTransfer.effectAllowed = "copy";
                      setDragState({ kind: "source" });
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

      <div className="sheetDirection" aria-hidden="true"><span>Drag headings into the output</span></div>

      <div className="outputColumnsWorkspace">
      <section className="card spreadsheetCard outputSpreadsheetCard" aria-labelledby="output-sheet-title">
        <div className="sheetHeader">
          <div>
            <p className="sheetLabel">Output sheet</p>
            <h2 id="output-sheet-title">Output Columns</h2>
            <p className="muted">Arrange fields, then select a heading to configure it.</p>
          </div>
          <div className="sheetHeaderActions">
            <span className="badge">{draft.columns.length} columns</span>
            {canInteract ? <button className="secondary" type="button" aria-expanded={addColumnMode !== null} onClick={() => setAddColumnMode((current) => current === null ? "CHOICES" : null)}><Plus aria-hidden="true" size={16} /> Add column</button> : null}
          </div>
        </div>
        {addColumnMode ? (
          <section className="addColumnPanel" aria-label="Add column">
            {addColumnMode === "CHOICES" ? (
              <>
                <div><strong>Choose column type</strong><span>Reuse a source field with adjustments, or add a fixed value.</span></div>
                <div className="actions">
                  <button className="secondary" type="button" onClick={() => setAddColumnMode("SOURCE")}>From source field</button>
                  <button className="secondary" type="button" onClick={addFixedColumn}>Fixed value</button>
                </div>
              </>
            ) : (
              <>
                <label className="field addSourceColumnField">
                  <span>Source field</span>
                  <select value={sourceColumnToAdd} onChange={(event) => setSourceColumnToAdd(Number(event.target.value))}>
                    {source.headers.map((heading, index) => <option value={index} key={`${heading}-${index}`}>Column {index + 1} · {heading}</option>)}
                  </select>
                </label>
                <div className="actions">
                  <button className="primary" type="button" onClick={addChosenSourceColumn} disabled={source.headers.length === 0}>Add source column</button>
                  <button className="secondary" type="button" onClick={() => setAddColumnMode("CHOICES")}>Back</button>
                </div>
              </>
            )}
          </section>
        ) : null}
        <div {...outputSheetPan.handlers} aria-label="Output Sheet horizontal preview" className={`${draft.columns.length === 0 ? "outputSheetScroll emptyOutputDropzone" : "outputSheetScroll"} horizontalPanSurface${isDragging ? " dragTargetActive" : ""}${outputSheetPan.isPanning ? " isPanning" : ""}`} onDragOver={(event) => { if (canInteract) event.preventDefault(); }} onDrop={(event) => dropAtInsertion(event, insertionIndex ?? draft.columns.length)} tabIndex={0}>
          {draft.columns.length > 0 ? (
            <table className="builderSheet outputBuilderSheet">
              <thead>
                <tr>
                  {draft.columns.map((column, index) => {
                    const customised = column.columnType === "SOURCE" && column.outputHeading !== column.sourceHeading;
                    const ruleDescription = describeColumnRule(column);
                    return (
                        <th key={column.clientId} className={outputHeadingInsertionClassName(selectedColumnId === column.clientId, customised || column.columnType === "STATIC", insertionIndex, index, draft.columns.length)} draggable={canInteract} onDragEnd={finishDrag} onDragOver={(event) => updateInsertionFromColumn(event, index)} onDrop={(event) => dropAtInsertion(event, insertionIndex ?? index)} onDragStart={(event) => {
                          event.dataTransfer.setData(outputDragType, column.clientId);
                          event.dataTransfer.effectAllowed = "move";
                          setDragState({ kind: "output", clientId: column.clientId });
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
                          {canInteract ? (
                            <div className="outputHeadingControls" aria-label={`Controls for ${column.outputHeading || "untitled column"}`}>
                              <button className="sheetIconButton staticPosition" type="button" draggable={false} onClick={() => moveColumn(column.clientId, index - 1)} disabled={index === 0} aria-label="Move left" title="Move left"><ChevronLeft aria-hidden="true" size={15} /></button>
                              <button className="sheetIconButton staticPosition" type="button" draggable={false} onClick={() => moveColumn(column.clientId, index + 1)} disabled={index === draft.columns.length - 1} aria-label="Move right" title="Move right"><ChevronRight aria-hidden="true" size={15} /></button>
                              <button className="sheetIconButton staticPosition dangerIconButton" type="button" draggable={false} onClick={() => removeColumn(column.clientId)} aria-label="Delete column" title="Delete column"><X aria-hidden="true" size={15} /></button>
                            </div>
                          ) : null}
                        </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.outputRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, columnIndex) => <td key={`${draft.columns[columnIndex].clientId}-${rowIndex}`}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="emptyOutputMessage"><Plus aria-hidden="true" size={24} /><strong>Drop a source heading here</strong><span>Or use Add column to reuse a source field or add a fixed value.</span></div>
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

      </section>
        <OutputColumnInspector column={selectedColumn ?? null} canEdit={canInteract} onChange={updateSelectedColumn} />
      </div>
      </section>

      <section className="outputWorkflowStage" id="rules-output" aria-labelledby="rules-output-title">
        <div className="workflowStageHeader"><span>2</span><div><h2 id="rules-output-title">Rules &amp; Output</h2><p className="muted">Choose which rows to include and how the files should be created.</p></div></div>
        <div className="rulesOutputGrid">
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
        worksheets={source.workbookWorksheets ?? [{ id: source.id, name: source.worksheetName, position: 0, headers: source.headers }]}
        filenameDate={filenameDate}
        canEdit={canInteract}
        onChange={(changes) => { setDraft((current) => ({ ...current, ...changes })); resetSaveState(); }}
        onFilenameDateChange={setFilenameDate}
      />
        </div>
      </section>

      <section className="outputWorkflowStage" id="worksheets" aria-labelledby="worksheets-stage-title">
        <div className="workflowStageHeader"><span>3</span><div><h2 id="worksheets-stage-title">Worksheets</h2><p className="muted">Choose the source worksheets included in this run.</p></div></div>
        <OutputProfileWorksheets
          profile={draft}
          worksheets={source.workbookWorksheets ?? [{ id: source.id, name: source.worksheetName, position: 0, headers: source.headers }]}
          canEdit={canInteract}
          onChange={(selectedWorksheetIds) => { setDraft((current) => ({ ...current, selectedWorksheetIds })); resetSaveState(); }}
        />
      </section>

      <section className="outputWorkflowStage" id="generate" aria-labelledby="generate-stage-title">
        <div className="workflowStageHeader"><span>4</span><div><h2 id="generate-stage-title">Generate</h2><p className="muted">Review readiness and download the finished output.</p></div></div>
        <OutputGenerationPanel projectId={source.projectId} sourceWorkbookImportId={source.sourceWorkbookImportId} sourceFilename={source.workbookFileName} draft={draft} worksheets={source.workbookWorksheets ?? [{ id: source.id, name: source.worksheetName, position: 0, headers: source.headers }]} filenameDate={filenameDate} canEdit={canEdit && !isSaving} />
      </section>
    </section>
  );
}
