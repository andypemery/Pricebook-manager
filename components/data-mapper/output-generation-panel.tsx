"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { updateValidationIssueOverridesAction } from "@/lib/actions/validation-override.actions";
import { saveInputFromOutputProfileDraft } from "@/lib/data-mapper/output-profiles/draft-state";
import { uploadSourceWorkbookDirectly } from "@/lib/data-mapper/source-workbook-direct-upload";
import type { OutputProfileDraft } from "@/lib/data-mapper/output-profiles/types";

type Issue = { fingerprint: string; severity: "Error" | "Warning"; worksheetName: string; rowNumber: number; field: string; currentValue: string | null; category: string; message: string; ignored: boolean };
type ValidationState = { issues: Issue[]; blockingCount: number; ignoredBlockingCount: number; unresolvedBlockingCount: number; warningCount: number };

export function OutputGenerationPanel({ sourceWorkbookImportId, draft, filenameDate, canEdit }: { sourceWorkbookImportId: string; draft: OutputProfileDraft; filenameDate: string; canEdit: boolean }) {
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ValidationState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiresReupload, setRequiresReupload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const blockingIssues = useMemo(() => state?.issues.filter((issue) => issue.severity === "Error") ?? [], [state]);

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
      const response = await fetch("/api/data-mapper/outputs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: saveInputFromOutputProfileDraft(draft), effectiveDate: filenameDate }) });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || "The output file could not be generated."); }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "output";
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; link.click(); URL.revokeObjectURL(link.href);
      const rowCount = response.headers.get("X-Generated-Row-Count");
      setMessage(`${Number(rowCount ?? 0).toLocaleString("en-GB")} rows generated and downloaded.`);
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "The output file could not be generated."); }
    setPending(false);
  }

  return <section className="card outputGenerationPanel" aria-labelledby="generate-output-title">
    <div className="sectionHeader"><div><p className="sheetLabel">Final step</p><h2 id="generate-output-title">Generate output file</h2><p className="muted">The complete source workbook is processed once on the server. Ignoring an error does not correct the source workbook. Generated output may still contain the affected value.</p></div></div>
    {loading ? <p className="muted"><LoaderCircle className="spinIcon" size={16} /> Checking source validation…</p> : null}
    {requiresReupload ? <div className="warningBox"><p>This historical source file must be re-uploaded before output generation. The replacement is validated before the existing source reference is changed.</p><div className="actions"><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => reuploadInputRef.current?.click()}><Upload aria-hidden="true" size={18} /> {pending ? `Uploading… ${uploadProgress ?? 0}%` : "Re-upload source workbook"}</button><input ref={reuploadInputRef} className="visuallyHidden" type="file" accept=".xlsx,.xlsm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void reuploadSourceWorkbook(file); }} /></div></div> : null}
    {state ? <>
      <div className="summaryGrid"><div><strong>{state.blockingCount}</strong><span>Blocking errors</span></div><div><strong>{state.ignoredBlockingCount}</strong><span>Ignored</span></div><div><strong>{state.unresolvedBlockingCount}</strong><span>Unresolved</span></div><div><strong>{state.warningCount}</strong><span>Warnings</span></div></div>
      {state.ignoredBlockingCount > 0 ? <p className="validationWarningGuidance">This source contains {state.ignoredBlockingCount} ignored validation {state.ignoredBlockingCount === 1 ? "error" : "errors"}.</p> : null}
      {state.unresolvedBlockingCount > 0 ? <p className="validationErrorGuidance">Resolve or ignore the remaining {state.unresolvedBlockingCount} blocking {state.unresolvedBlockingCount === 1 ? "error" : "errors"} before generating this file.</p> : null}
      {blockingIssues.length > 0 ? <div className="validationOverrideActions"><div className="actions"><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => setSelected(blockingIssues.map((issue) => issue.fingerprint))}>Select all blocking errors</button><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => setSelected([])}>Clear selection</button><button className="secondary" type="button" disabled={!canEdit || pending || selected.length === 0} onClick={() => change(selected, "IGNORE")}>Ignore selected</button><button className="secondary" type="button" disabled={!canEdit || pending || selected.length === 0} onClick={() => change(selected, "RESTORE")}>Restore selected</button><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => change(blockingIssues.filter((issue) => !issue.ignored).map((issue) => issue.fingerprint), "IGNORE", `Ignore all ${state.unresolvedBlockingCount} blocking errors?\n\nThis does not correct the source workbook. These issues will remain recorded as ignored and output generation will be allowed.`)}>Ignore all blocking errors</button>{state.ignoredBlockingCount > 0 ? <button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => change(blockingIssues.filter((issue) => issue.ignored).map((issue) => issue.fingerprint), "RESTORE", `Restore all ${state.ignoredBlockingCount} ignored errors?`)}>Restore all ignored errors</button> : null}</div>
        <div className="validationOverrideList">{blockingIssues.map((issue) => <label className={issue.ignored ? "validationOverrideIssue ignored" : "validationOverrideIssue"} key={issue.fingerprint}><input type="checkbox" checked={selected.includes(issue.fingerprint)} disabled={!canEdit || pending} onChange={(event) => setSelected((current) => event.target.checked ? [...current, issue.fingerprint] : current.filter((fingerprint) => fingerprint !== issue.fingerprint))} /><span><strong>{issue.ignored ? "Ignored · " : ""}{issue.worksheetName} row {issue.rowNumber} · {issue.field}</strong><small>{issue.message}{issue.currentValue ? ` Current value: ${issue.currentValue}` : ""}</small></span><button className="secondary" type="button" disabled={!canEdit || pending} onClick={() => change([issue.fingerprint], issue.ignored ? "RESTORE" : "IGNORE")}>{issue.ignored ? "Restore" : "Ignore"}</button></label>)}</div>
      </div> : null}
      <div className="actions"><button className="primary" type="button" disabled={!canEdit || pending || state.unresolvedBlockingCount > 0 || draft.columns.length === 0} onClick={generate}><Download aria-hidden="true" size={18} /> {pending ? "Generating" : "Generate output file"}</button></div>
    </> : null}
    {message ? <p className="success" role="status">{message}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
