"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Upload, X } from "lucide-react";
import { updateValidationIssueOverridesAction } from "@/lib/actions/validation-override.actions";
import { updateSourceRowExclusionsAction } from "@/lib/actions/source-row-exclusion.actions";
import { saveInputFromOutputProfileDraft } from "@/lib/data-mapper/output-profiles/draft-state";
import { uploadSourceWorkbookDirectly } from "@/lib/data-mapper/source-workbook-direct-upload";
import type { OutputProfileDraft, SourceWorkbookWorksheet } from "@/lib/data-mapper/output-profiles/types";
import { outputProfileGenerationReadiness } from "@/lib/data-mapper/output-profiles/configuration";
import { sourceRowKey, type SourceRowReference } from "@/lib/data-mapper/source-row-exclusions";
import { updateVisibleRowSelection, visibleRowSelectionState } from "@/lib/data-mapper/validation-preview";

type Issue = { fingerprint: string; rowFingerprint: string; severity: "Error" | "Warning"; worksheetName: string; rowNumber: number; field: string; currentValue: string | null; category: string; message: string; ignored: boolean };
type ExcludedRow = SourceRowReference & { id: string; sourceWorksheetId: string; excludedAt: string; excludedById: string; issues: Issue[] };
type ValidationState = { issues: Issue[]; excludedRows: ExcludedRow[]; blockingCount: number; ignoredBlockingCount: number; unresolvedBlockingCount: number; warningCount: number; totalErrorCount: number; totalWarningCount: number; activeErrorCount: number; activeWarningCount: number; excludedRowCount: number };

function worksheetModeLabel(mode: OutputProfileDraft["worksheetMode"]) {
  if (mode === "SEPARATE_WORKSHEETS") return "Separate worksheets";
  if (mode === "SEPARATE_FILES") return "Separate file per worksheet";
  return "Combined output";
}

export function OutputGenerationPanel({ projectId, sourceWorkbookImportId, sourceFilename, draft, worksheets = [], filenameDate, canEdit }: { projectId: string; sourceWorkbookImportId: string; sourceFilename: string; draft: OutputProfileDraft; worksheets?: SourceWorkbookWorksheet[]; filenameDate: string; canEdit: boolean }) {
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ValidationState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deletedReviewOpen, setDeletedReviewOpen] = useState(false);
  const [pendingDeleteRows, setPendingDeleteRows] = useState<SourceRowReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiresReupload, setRequiresReupload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const selectedWorksheetIds = draft.selectedWorksheetIds ?? [draft.sourceWorksheetId];
  const selectedWorksheets = worksheets.filter((worksheet) => selectedWorksheetIds.includes(worksheet.id));
  const selectedWorksheetNames = new Set(selectedWorksheets.map((worksheet) => worksheet.name));
  const relevantIssues = state?.issues.filter((issue) => worksheets.length === 0 || selectedWorksheetNames.has(issue.worksheetName)) ?? [];
  const blockingIssues = relevantIssues.filter((issue) => issue.severity === "Error");
  const ignoredBlockingCount = blockingIssues.filter((issue) => issue.ignored).length;
  const unresolvedBlockingCount = blockingIssues.length - ignoredBlockingCount;
  const warningCount = relevantIssues.filter((issue) => issue.severity === "Warning").length;
  const validationRows = (() => {
    const grouped = new Map<string, { key: string; worksheetName: string; rowNumber: number; rowFingerprint: string; issues: Issue[] }>();
    for (const issue of relevantIssues) {
      const key = sourceRowKey(issue.worksheetName, issue.rowNumber);
      const row = grouped.get(key) ?? { key, worksheetName: issue.worksheetName, rowNumber: issue.rowNumber, rowFingerprint: issue.rowFingerprint, issues: [] };
      row.issues.push(issue);
      grouped.set(key, row);
    }
    return [...grouped.values()];
  })();
  const visibleRowKeys = validationRows.map((row) => row.key);
  const selectionState = visibleRowSelectionState(selected, visibleRowKeys);
  const selectedValidationRows = validationRows.filter((row) => selected.has(row.key));
  const selectedErrorIssues = selectedValidationRows.flatMap((row) => row.issues.filter((issue) => issue.severity === "Error"));
  const selectedRowReferences = selectedValidationRows.map((row) => ({
    worksheetName: row.worksheetName,
    physicalRowNumber: row.rowNumber,
    rowFingerprint: row.rowFingerprint
  }));
  const relevantExcludedRows = state?.excludedRows.filter((row) => worksheets.length === 0 || selectedWorksheetNames.has(row.worksheetName)) ?? [];
  const readiness = outputProfileGenerationReadiness(draft, sourceFilename, filenameDate, worksheets, unresolvedBlockingCount);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/data-mapper/source-imports/${encodeURIComponent(sourceWorkbookImportId)}/validation`, { cache: "no-store" });
      const body = await response.json() as ValidationState & { error?: string; code?: string };
      if (body.code === "SOURCE_WORKBOOK_REUPLOAD_REQUIRED") setRequiresReupload(true);
      if (!response.ok) throw new Error(body.error || "Validation state could not be loaded.");
      setRequiresReupload(false);
      setError(null);
      setState(body);
      setSelected(new Set());
    } catch (loadError) {
      setState(null);
      setSelected(new Set());
      setError(loadError instanceof Error ? loadError.message : "Validation state could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function reuploadSourceWorkbook(file: File) {
    if (!canEdit || pending) return;
    setPending(true); setError(null); setMessage(null); setUploadProgress(0);
    try {
      await uploadSourceWorkbookDirectly(file, { projectId, replaceSourceWorkbookImportId: sourceWorkbookImportId, onProgress: setUploadProgress });
      setMessage("Source workbook re-uploaded and validation refreshed. Previous validation ignores and deleted-row exclusions were cleared.");
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The source workbook could not be re-uploaded.");
    } finally {
      setPending(false); setUploadProgress(null);
      if (reuploadInputRef.current) reuploadInputRef.current.value = "";
    }
  }

  // Schedule the fetch outside the render-effect phase; the result is external server state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [sourceWorkbookImportId]);

  async function change(fingerprints: string[], action: "IGNORE" | "RESTORE", confirmation?: string) {
    if (!canEdit || fingerprints.length === 0 || pending) return;
    if (confirmation && !window.confirm(confirmation)) return;
    setPending(true); setError(null); setMessage(null);
    const result = await updateValidationIssueOverridesAction({ sourceWorkbookImportId, fingerprints, action });
    if (!result.ok) setError(result.error);
    else { setMessage(action === "IGNORE" ? "Validation errors are recorded as ignored." : "Validation errors are restored as unresolved."); await load(); }
    setPending(false);
  }

  async function changeRows(rows: SourceRowReference[], action: "EXCLUDE" | "RESTORE") {
    if (!canEdit || rows.length === 0 || pending) return;
    setPending(true); setError(null); setMessage(null);
    const result = await updateSourceRowExclusionsAction({ sourceWorkbookImportId, rows, action });
    if (!result.ok) setError(result.error);
    else {
      setMessage(action === "EXCLUDE" ? "Selected rows are excluded from processed data and generated outputs." : "Deleted rows were restored to processed data.");
      await load();
    }
    setPending(false);
  }

  async function confirmDeleteRows() {
    const rows = pendingDeleteRows;
    setPendingDeleteRows([]);
    await changeRows(rows, "EXCLUDE");
  }

  async function generate() {
    if (!canEdit || pending) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const generationDraft = { ...saveInputFromOutputProfileDraft(draft), selectedWorksheetIds };
      const response = await fetch("/api/data-mapper/outputs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: generationDraft, effectiveDate: filenameDate }) });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || "The output file could not be generated."); }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "output";
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; link.click(); URL.revokeObjectURL(link.href);
      const rowCount = Number(response.headers.get("X-Generated-Row-Count") ?? 0);
      const worksheetCount = Number(response.headers.get("X-Generated-Worksheet-Count") ?? 0);
      const zeroRows = decodeURIComponent(response.headers.get("X-Zero-Row-Worksheets") ?? "").split("|").filter(Boolean);
      setMessage(`${worksheetCount.toLocaleString("en-GB")} ${worksheetCount === 1 ? "worksheet" : "worksheets"} processed · ${rowCount.toLocaleString("en-GB")} rows generated. ${fileName} downloaded.${zeroRows.length > 0 ? ` ${zeroRows.length} ${zeroRows.length === 1 ? "worksheet produced" : "worksheets produced"} 0 matching rows: ${zeroRows.join(", ")}.` : ""}`);
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "The output file could not be generated."); }
    setPending(false);
  }

  return <section className="card outputGenerationPanel" aria-labelledby="generate-output-title">
    <div className="generationReadinessHeader">
      <div>
        <p className="sheetLabel">Generation readiness</p>
        <h2 id="generate-output-title">{readiness.ready ? "Ready to generate" : `${readiness.issues.length} ${readiness.issues.length === 1 ? "thing needs" : "things need"} attention`}</h2>
        <p className="muted">{selectedWorksheets.length} {selectedWorksheets.length === 1 ? "worksheet" : "worksheets"} · {draft.outputFormat} · {worksheetModeLabel(draft.worksheetMode)}</p>
      </div>
      <button className="primary" type="button" disabled={!canEdit || pending || !readiness.ready} onClick={generate}><Download aria-hidden="true" size={18} /> {pending ? "Generating" : "Generate output"}</button>
    </div>
    {loading ? <p className="muted"><LoaderCircle className="spinIcon" size={16} /> Checking source validation…</p> : null}
    {requiresReupload ? <div className="warningBox"><p>This historical source file must be re-uploaded before output generation. The replacement is validated before the existing source reference is changed.</p><div className="actions"><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => reuploadInputRef.current?.click()}><Upload aria-hidden="true" size={18} /> {pending ? `Uploading… ${uploadProgress ?? 0}%` : "Re-upload source workbook"}</button><input ref={reuploadInputRef} className="visuallyHidden" type="file" accept=".xlsx,.xlsm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void reuploadSourceWorkbook(file); }} /></div></div> : null}
    {state ? <>
      <p className={unresolvedBlockingCount > 0 ? "validationCompactSummary blocking" : "validationCompactSummary"}>
        {unresolvedBlockingCount > 0
          ? `${unresolvedBlockingCount} blocking validation ${unresolvedBlockingCount === 1 ? "error needs" : "errors need"} attention before generation.`
          : `${ignoredBlockingCount} validation ${ignoredBlockingCount === 1 ? "error" : "errors"} ignored · ${warningCount} ${warningCount === 1 ? "warning" : "warnings"} · ${relevantExcludedRows.length} deleted ${relevantExcludedRows.length === 1 ? "row" : "rows"} · ${selectedWorksheets.length} ${selectedWorksheets.length === 1 ? "worksheet" : "worksheets"} selected`}
      </p>
      {relevantIssues.length > 0 || relevantExcludedRows.length > 0 ? <div className="actions validationReviewActions">{relevantIssues.length > 0 ? <button className="secondary" type="button" onClick={() => setReviewOpen(true)}>Review validation issues</button> : null}{relevantExcludedRows.length > 0 ? <button className="secondary" type="button" onClick={() => setDeletedReviewOpen(true)}>{relevantExcludedRows.length} deleted {relevantExcludedRows.length === 1 ? "row" : "rows"} · Review</button> : null}<button className="linkButton" type="button" disabled={!canEdit || pending || unresolvedBlockingCount === 0} onClick={() => change(blockingIssues.filter((issue) => !issue.ignored).map((issue) => issue.fingerprint), "IGNORE", `Ignore all ${unresolvedBlockingCount} blocking errors?\n\nThis does not correct the source workbook.`)}>Ignore all blocking errors</button><button className="linkButton" type="button" disabled={!canEdit || pending || ignoredBlockingCount === 0} onClick={() => change(blockingIssues.filter((issue) => issue.ignored).map((issue) => issue.fingerprint), "RESTORE", `Restore all ${ignoredBlockingCount} ignored errors?`)}>Restore all ignored errors</button></div> : null}
      {!readiness.ready ? <div className="readinessIssues"><strong>Before generating:</strong><ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : blockingIssues.length > 0 ? <p className="muted">{ignoredBlockingCount} validation {ignoredBlockingCount === 1 ? "error has" : "errors have"} been explicitly ignored.</p> : null}
      {reviewOpen ? <div className="validationReviewBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false); }}><section className="validationReviewDialog" role="dialog" aria-modal="true" aria-labelledby="validation-review-title"><div className="sectionHeader"><div><h2 id="validation-review-title">Review validation issues</h2><p className="muted">Select error or warning rows. Delete excludes the whole row; Ignore only accepts selected blocking errors.</p></div><button className="iconButton" type="button" aria-label="Close validation issue review" onClick={() => setReviewOpen(false)}><X aria-hidden="true" size={20} /></button></div><div className="actions"><strong>{selected.size} {selected.size === 1 ? "row" : "rows"} selected</strong><button className="dangerButton" type="button" disabled={!canEdit || pending || selected.size === 0} onClick={() => setPendingDeleteRows(selectedRowReferences)}>Delete selected rows</button><button className="secondary" type="button" disabled={!canEdit || pending || !selectedErrorIssues.some((issue) => !issue.ignored)} onClick={() => change(selectedErrorIssues.filter((issue) => !issue.ignored).map((issue) => issue.fingerprint), "IGNORE")}>Ignore selected errors</button><button className="secondary" type="button" disabled={!canEdit || pending || !selectedErrorIssues.some((issue) => issue.ignored)} onClick={() => change(selectedErrorIssues.filter((issue) => issue.ignored).map((issue) => issue.fingerprint), "RESTORE")}>Restore selected errors</button></div><div className="previewTableWrap validationReviewTableWrap"><table className="previewTable validationReviewTable"><thead><tr><th><input type="checkbox" checked={selectionState.checked} aria-label={`Select all ${visibleRowKeys.length} visible validation rows`} ref={(element) => { if (element) element.indeterminate = selectionState.indeterminate; }} onChange={(event) => setSelected((current) => updateVisibleRowSelection(current, visibleRowKeys, event.target.checked))} /></th><th>Status</th><th>Worksheet</th><th>Row</th><th>Current value</th><th>Rule / message</th></tr></thead><tbody>{validationRows.map((row) => { const hasError = row.issues.some((issue) => issue.severity === "Error" && !issue.ignored); const ignoredOnly = row.issues.some((issue) => issue.severity === "Error") && row.issues.filter((issue) => issue.severity === "Error").every((issue) => issue.ignored); return <tr key={row.key} className={ignoredOnly ? "ignored" : undefined}><td><input aria-label={`Select ${row.worksheetName} row ${row.rowNumber}`} type="checkbox" checked={selected.has(row.key)} disabled={!canEdit || pending} onChange={(event) => setSelected((current) => updateVisibleRowSelection(current, [row.key], event.target.checked))} /></td><td><span className={hasError ? "badge danger" : ignoredOnly ? "badge" : "badge warning"}>{hasError ? "Error" : ignoredOnly ? "Ignored error" : "Warning"}</span></td><td>{row.worksheetName}</td><td>{row.rowNumber}</td><td>{row.issues.slice(0, 3).map((issue) => `${issue.field}: ${issue.currentValue || "Blank"}`).join(" · ")}{row.issues.length > 3 ? ` · + ${row.issues.length - 3} more` : ""}</td><td>{row.issues.slice(0, 3).map((issue) => issue.message).join(" · ")}{row.issues.length > 3 ? ` · + ${row.issues.length - 3} more` : ""}</td></tr>; })}</tbody></table></div></section></div> : null}
      {deletedReviewOpen ? <div className="validationReviewBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletedReviewOpen(false); }}><section className="validationReviewDialog" role="dialog" aria-modal="true" aria-labelledby="deleted-row-review-title"><div className="sectionHeader"><div><h2 id="deleted-row-review-title">Deleted rows</h2><p className="muted">Rows are excluded from processing; the original uploaded Excel file remains unchanged.</p></div><button className="iconButton" type="button" aria-label="Close deleted row review" onClick={() => setDeletedReviewOpen(false)}><X aria-hidden="true" size={20} /></button></div><div className="actions"><button className="secondary" type="button" disabled={!canEdit || pending || relevantExcludedRows.length === 0} onClick={() => changeRows(relevantExcludedRows, "RESTORE")}>Restore all deleted rows</button></div><div className="previewTableWrap"><table className="previewTable"><thead><tr><th>Worksheet</th><th>Row</th><th>Original severity</th><th>Current value</th><th>Validation reason</th><th>Action</th></tr></thead><tbody>{relevantExcludedRows.map((row) => <tr key={row.id}><td>{row.worksheetName}</td><td>{row.physicalRowNumber}</td><td>{row.issues.some((issue) => issue.severity === "Error") ? "Error" : "Warning"}</td><td>{row.issues.slice(0, 3).map((issue) => issue.currentValue || "Blank").join(" · ")}</td><td>{row.issues.slice(0, 3).map((issue) => issue.message).join(" · ")}</td><td><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => changeRows([row], "RESTORE")}>Restore</button></td></tr>)}</tbody></table></div></section></div> : null}
      {pendingDeleteRows.length > 0 ? <div className="validationReviewBackdrop" role="presentation"><section className="validationReviewDialog compactConfirmation" role="dialog" aria-modal="true" aria-labelledby="generation-delete-rows-title"><h2 id="generation-delete-rows-title">Delete selected rows</h2><p>Delete {pendingDeleteRows.length} selected {pendingDeleteRows.length === 1 ? "row" : "rows"} from this workbook&apos;s processed data? They will be excluded from generated outputs. The original uploaded Excel file will not be changed.</p><div className="actions"><button className="secondary" type="button" onClick={() => setPendingDeleteRows([])}>Cancel</button><button className="dangerButton" type="button" onClick={confirmDeleteRows}>Delete rows</button></div></section></div> : null}
    </> : null}
    {message ? <p className="success" role="status">{message}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
