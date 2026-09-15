"use client";

import { useMemo, useRef } from "react";
import { FileOutput, Info } from "lucide-react";
import { effectiveWorksheetName, outputProfileAttentionIssues } from "@/lib/data-mapper/output-profiles/configuration";
import { filenameTokenLabels, filenameTokens, resolveOutputFilename, type FilenameToken } from "@/lib/data-mapper/output-profiles/filename";
import type { OutputProfileDraft } from "@/lib/data-mapper/output-profiles/types";

const delimiterLabels = {
  COMMA: "Comma (,)",
  SEMICOLON: "Semicolon (;)",
  TAB: "Tab",
  PIPE: "Pipe (|)"
} as const;

type SettingChanges = Partial<Pick<
  OutputProfileDraft,
  "filenameTemplate" | "outputFormat" | "csvDelimiter" | "csvIncludeHeader" | "xlsxWorksheetName"
>>;

export function OutputProfileSettings({
  profile,
  sourceFilename,
  filenameDate,
  canEdit,
  onChange,
  onFilenameDateChange
}: {
  profile: OutputProfileDraft;
  sourceFilename: string;
  filenameDate: string;
  canEdit: boolean;
  onChange: (changes: SettingChanges) => void;
  onFilenameDateChange: (value: string) => void;
}) {
  const filenameInput = useRef<HTMLInputElement>(null);
  const resolved = useMemo(() => resolveOutputFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate: filenameDate,
    outputFormat: profile.outputFormat
  }), [filenameDate, profile.filenameTemplate, profile.name, profile.outputFormat, sourceFilename]);
  const attentionIssues = useMemo(
    () => outputProfileAttentionIssues(profile, sourceFilename, filenameDate),
    [filenameDate, profile, sourceFilename]
  );

  function insertToken(token: FilenameToken) {
    const input = filenameInput.current;
    const insertion = `{${token}}`;
    const start = input?.selectionStart ?? profile.filenameTemplate.length;
    const end = input?.selectionEnd ?? start;
    const next = `${profile.filenameTemplate.slice(0, start)}${insertion}${profile.filenameTemplate.slice(end)}`;
    onChange({ filenameTemplate: next });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  }

  return (
    <section className="card outputProfileSettings" aria-labelledby="output-settings-title">
      <div className="sectionHeader">
        <div>
          <p className="sheetLabel">Output settings</p>
          <h2 id="output-settings-title">Filename and file type</h2>
          <p className="muted">Configure the reusable definition now; file generation will be added later.</p>
        </div>
        <span className={attentionIssues.length === 0 ? "badge success" : "badge warning"}>
          {attentionIssues.length === 0 ? "Ready" : "Needs attention"}
        </span>
      </div>
      <div className="outputSettingsGrid">
        <label className="field filenameTemplateField">
          <span>Output filename</span>
          <input ref={filenameInput} value={profile.filenameTemplate} onChange={(event) => onChange({ filenameTemplate: event.target.value })} maxLength={200} disabled={!canEdit} />
        </label>
        <label className="field tokenInsertField">
          <span>Insert token</span>
          <select value="" onChange={(event) => { if (event.target.value) insertToken(event.target.value as FilenameToken); }} disabled={!canEdit}>
            <option value="">Choose a token</option>
            {filenameTokens.map((token) => <option value={token} key={token}>{filenameTokenLabels[token]} · {`{${token}}`}</option>)}
          </select>
        </label>
        <label className="field">
          <span title="Used for date tokens in the output filename.">Filename date</span>
          <input type="date" value={filenameDate} onChange={(event) => onFilenameDateChange(event.target.value)} />
        </label>
        <label className="field">
          <span>Output format</span>
          <select value={profile.outputFormat} onChange={(event) => onChange({ outputFormat: event.target.value as OutputProfileDraft["outputFormat"] })} disabled={!canEdit}>
            <option value="CSV">CSV</option>
            <option value="XLSX">XLSX</option>
          </select>
        </label>
      </div>

      <div className="filenamePreview" aria-live="polite">
        <FileOutput aria-hidden="true" size={20} />
        <div><span>Resolved filename preview</span><strong>{resolved.finalFilename || "No valid filename"}</strong></div>
      </div>
      {resolved.errors.map((error) => <p className="error" role="alert" key={error}>{error}</p>)}
      {resolved.warnings.map((warning) => <p className="warningText" key={warning}><Info aria-hidden="true" size={15} /> {warning}</p>)}

      {profile.outputFormat === "CSV" ? (
        <div className="formatSettings" aria-label="CSV settings">
          <label className="field"><span>Delimiter</span><select value={profile.csvDelimiter} onChange={(event) => onChange({ csvDelimiter: event.target.value as OutputProfileDraft["csvDelimiter"] })} disabled={!canEdit}>
            {Object.entries(delimiterLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <label className="checkboxField"><input type="checkbox" checked={profile.csvIncludeHeader} onChange={(event) => onChange({ csvIncludeHeader: event.target.checked })} disabled={!canEdit} /><span>Include header row</span></label>
        </div>
      ) : (
        <div className="formatSettings" aria-label="XLSX settings">
          <label className="field worksheetNameField">
            <span>Worksheet name (optional)</span>
            <input value={profile.xlsxWorksheetName} onChange={(event) => onChange({ xlsxWorksheetName: event.target.value })} maxLength={31} disabled={!canEdit} placeholder={effectiveWorksheetName(profile.name, "")} />
            <small>The tab name inside the Excel workbook. If blank, it will use “{effectiveWorksheetName(profile.name, "")}”.</small>
          </label>
        </div>
      )}

      {attentionIssues.length > 0 ? <div className="attentionList"><strong>Before this profile can be generated:</strong><ul>{attentionIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
    </section>
  );
}
