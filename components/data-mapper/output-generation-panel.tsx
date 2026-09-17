"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Upload, X } from "lucide-react";
import { updateValidationIssueOverridesAction } from "@/lib/actions/validation-override.actions";
import { saveInputFromOutputProfileDraft } from "@/lib/data-mapper/output-profiles/draft-state";
import { uploadSourceWorkbookDirectly } from "@/lib/data-mapper/source-workbook-direct-upload";
import type { OutputProfileDraft, SourceWorkbookWorksheet } from "@/lib/data-mapper/output-profiles/types";
import { outputProfileGenerationReadiness } from "@/lib/data-mapper/output-profiles/configuration";

type Issue = { fingerprint: string; severity: "Error" | "Warning"; worksheetName: string; rowNumber: number; field: string; currentValue: string | null; category: string; message: string; ignored: boolean };
type ValidationState = { issues: Issue[]; blockingCount: number; ignoredBlockingCount: number; unresolvedBlockingCount: number; warningCount: number };

function worksheetModeLabel(mode: OutputProfileDraft["worksheetMode"]) {
  if (mode === "SEPARATE_WORKSHEETS") return "Separate worksheets";
  if (mode === "SEPARATE_FILES") return "Separate file per worksheet";
  return "Combined output";
}

export function OutputGenerationPanel({ sourceWorkbookImportId, sourceFilename, draft, worksheets = [], filenameDate, canEdit }: { sourceWorkbookImportId: string; sourceFilename: string; draft: OutputProfileDraft; worksheets?: SourceWorkbookWorksheet[]; filenameDate: string; canEdit: boolean }) {
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ValidationState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
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
      setSelected([]);
    } catch (loadError) {
      setState(null);
      setSelected([]);
      setError(loadError instanceof Error ? loadError.message : "Validation state could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function reuploadSourceWorkbook(file: File) {
    if (!canEdit || pending) return;
    setPending(true); setError(null); setMessage(null); setUploadProgress(0);
    try {
      await uploadSourceWorkbookDirectly(file, { replaceSourceWorkbookImportId: sourceWorkbookImportId, onProgress: setUploadProgress });
      setMessage("Source workbook re-uploaded and validation refreshed. Previous validation ignores were cleared.");
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
          : `${ignoredBlockingCount} validation ${ignoredBlockingCount === 1 ? "error" : "errors"} ignored · ${warningCount} ${warningCount === 1 ? "warning" : "warnings"} · ${selectedWorksheets.length} ${selectedWorksheets.length === 1 ? "worksheet" : "worksheets"} selected`}
      </p>
      {relevantIssues.length > 0 ? <div className="actions validationReviewActions"><button className="secondary" type="button" onClick={() => setReviewOpen(true)}>Review validation issues</button><button className="linkButton" type="button" disabled={!canEdit || pending || unresolvedBlockingCount === 0} onClick={() => change(blockingIssues.filter((issue) => !issue.ignored).map((issue) => issue.fingerprint), "IGNORE", `Ignore all ${unresolvedBlockingCount} blocking errors?\n\nThis does not correct the source workbook.`)}>Ignore all blocking errors</button><button className="linkButton" type="button" disabled={!canEdit || pending || ignoredBlockingCount === 0} onClick={() => change(blockingIssues.filter((issue) => issue.ignored).map((issue) => issue.fingerprint), "RESTORE", `Restore all ${ignoredBlockingCount} ignored errors?`)}>Restore all ignored errors</button></div> : null}
      {!readiness.ready ? <div className="readinessIssues"><strong>Before generating:</strong><ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : blockingIssues.length > 0 ? <p className="muted">{ignoredBlockingCount} validation {ignoredBlockingCount === 1 ? "error has" : "errors have"} been explicitly ignored.</p> : null}
      {reviewOpen ? <div className="validationReviewBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false); }}><section className="validationReviewDialog" role="dialog" aria-modal="true" aria-labelledby="validation-review-title"><div className="sectionHeader"><div><h2 id="validation-review-title">Review validation issues</h2><p className="muted">Select blocking errors to ignore or restore. Warnings require no override.</p></div><button className="iconButton" type="button" aria-label="Close validation issue review" onClick={() => setReviewOpen(false)}><X aria-hidden="true" size={20} /></button></div><div className="actions"><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => setSelected(blockingIssues.map((issue) => issue.fingerprint))}>Select all blocking errors</button><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => setSelected([])}>Clear selection</button><button className="secondary" type="button" disabled={!canEdit || pending || selected.length === 0} onClick={() => change(selected, "IGNORE")}>Ignore selected</button><button className="secondary" type="button" disabled={!canEdit || pending || selected.length === 0} onClick={() => change(selected, "RESTORE")}>Restore selected</button></div><div className="previewTableWrap validationReviewTableWrap"><table className="previewTable validationReviewTable"><thead><tr><th><span className="visuallyHidden">Select</span></th><th>Status</th><th>Worksheet</th><th>Row</th><th>Field</th><th>Current value</th><th>Message</th><th>Action</th></tr></thead><tbody>{state.issues.map((issue) => <tr key={issue.fingerprint} className={issue.ignored ? "ignored" : undefined}><td>{issue.severity === "Error" ? <input aria-label={`Select ${issue.worksheetName} row ${issue.rowNumber} ${issue.field}`} type="checkbox" checked={selected.includes(issue.fingerprint)} disabled={!canEdit || pending} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, issue.fingerprint])] : current.filter((fingerprint) => fingerprint !== issue.fingerprint))} /> : null}</td><td><span className={issue.severity === "Error" ? issue.ignored ? "badge" : "badge danger" : "badge warning"}>{issue.ignored ? "Ignored error" : issue.severity}</span></td><td>{issue.worksheetName}</td><td>{issue.rowNumber}</td><td>{issue.field}</td><td>{issue.currentValue || "Blank"}</td><td>{issue.message}</td><td>{issue.severity === "Error" ? <button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => change([issue.fingerprint], issue.ignored ? "RESTORE" : "IGNORE")}>{issue.ignored ? "Restore" : "Ignore"}</button> : "—"}</td></tr>)}</tbody></table></div></section></div> : null}
    </> : null}
    {message ? <p className="success" role="status">{message}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
