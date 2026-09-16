"use client";

import { useMemo, useRef } from "react";
import { CalendarDays, FileOutput, Info } from "lucide-react";
import {
  configuredWorksheetName,
  effectiveWorksheetName,
  normaliseWorksheetIdentity,
  outputProfileAttentionIssues,
  validateWorksheetNames
} from "@/lib/data-mapper/output-profiles/configuration";
import { filenameTokenLabels, filenameTokens, resolveOutputFilename, resolveOutputPackageFilename, type FilenameToken } from "@/lib/data-mapper/output-profiles/filename";
import type { OutputProfileDraft, SourceWorkbookWorksheet } from "@/lib/data-mapper/output-profiles/types";
import { resolveWorksheetCompatibility } from "@/lib/data-mapper/output-profiles/worksheet-compatibility";

const delimiterLabels = {
  COMMA: "Comma (,)",
  SEMICOLON: "Semicolon (;)",
  TAB: "Tab",
  PIPE: "Pipe (|)"
} as const;

type SettingChanges = Partial<Pick<
  OutputProfileDraft,
  | "filenameTemplate"
  | "outputFormat"
  | "csvDelimiter"
  | "csvIncludeHeader"
  | "xlsxWorksheetName"
  | "worksheetMode"
  | "worksheetNameMode"
  | "worksheetNameMappings"
  | "selectedWorksheetIds"
>>;

export function OutputProfileSettings({
  profile,
  sourceFilename,
  worksheets = [],
  filenameDate,
  canEdit,
  onChange,
  onFilenameDateChange
}: {
  profile: OutputProfileDraft;
  sourceFilename: string;
  worksheets?: SourceWorkbookWorksheet[];
  filenameDate: string;
  canEdit: boolean;
  onChange: (changes: SettingChanges) => void;
  onFilenameDateChange: (value: string) => void;
}) {
  const filenameInput = useRef<HTMLInputElement>(null);
  const filenameDateInput = useRef<HTMLInputElement>(null);
  const worksheetMode = profile.worksheetMode ?? "COMBINE";
  const worksheetNameMode = profile.worksheetNameMode ?? "SOURCE";
  const worksheetNameMappings = profile.worksheetNameMappings ?? {};
  const selectedWorksheetIds = profile.selectedWorksheetIds ?? worksheets.slice(0, 1).map((worksheet) => worksheet.id);
  const worksheetStates = useMemo(() => worksheets.map((worksheet) => ({
    ...worksheet,
    compatibility: resolveWorksheetCompatibility(profile, worksheet.headers)
  })), [profile, worksheets]);
  const selectedWorksheets = worksheetStates.filter((worksheet) => selectedWorksheetIds.includes(worksheet.id));
  const outputWorksheetNames = selectedWorksheets.map((worksheet) => configuredWorksheetName(profile, worksheet.name));
  const namingIssues = worksheetMode === "COMBINE" ? [] : validateWorksheetNames(outputWorksheetNames);
  const selectedIncompatibleCount = selectedWorksheets.filter((worksheet) => !worksheet.compatibility.compatible).length;
  const resolved = useMemo(() => resolveOutputFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate: filenameDate,
    outputFormat: profile.outputFormat
  }), [filenameDate, profile.filenameTemplate, profile.name, profile.outputFormat, sourceFilename]);
  const separateFilePreviews = selectedWorksheets.map((worksheet) => resolveOutputFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate: filenameDate,
    outputFormat: profile.outputFormat,
    worksheetName: configuredWorksheetName(profile, worksheet.name),
    appendWorksheetSuffix: true
  }).finalFilename);
  const packagePreview = resolveOutputPackageFilename({
    filenameTemplate: profile.filenameTemplate,
    profileName: profile.name,
    sourceFilename,
    effectiveDate: filenameDate
  });
  const attentionIssues = useMemo(
    () => outputProfileAttentionIssues(profile, sourceFilename, filenameDate),
    [filenameDate, profile, sourceFilename]
  );
  const contextualIssues = [
    ...attentionIssues,
    ...(selectedWorksheetIds.length === 0 ? ["Select at least one worksheet to include."] : []),
    ...(selectedIncompatibleCount > 0 ? [`This profile is not compatible with ${selectedIncompatibleCount} selected ${selectedIncompatibleCount === 1 ? "worksheet" : "worksheets"}.`] : []),
    ...namingIssues
  ];

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

  function openFilenameDatePicker() {
    const input = filenameDateInput.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") input.showPicker();
  }

  function setCustomWorksheetName(sourceName: string, outputName: string) {
    const key = normaliseWorksheetIdentity(sourceName);
    const nextMappings = { ...worksheetNameMappings };
    if (outputName.trim()) nextMappings[key] = outputName;
    else delete nextMappings[key];
    onChange({
      worksheetNameMappings: nextMappings
    });
  }

  return (
    <section className="card outputProfileSettings" aria-labelledby="output-settings-title">
      <div className="sectionHeader">
        <div>
          <p className="sheetLabel">Output settings</p>
          <h2 id="output-settings-title">Filename, file type and worksheets</h2>
          <p className="muted">Configure the reusable definition and choose worksheets for this generation.</p>
        </div>
        <span className={contextualIssues.length === 0 ? "badge success" : "badge warning"}>
          {contextualIssues.length === 0 ? "Ready" : "Needs attention"}
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
        <label className="field filenameDateField">
          <span title="Used for date tokens in the output filename.">Filename date</span>
          <span className="dateInputWrap">
            <input ref={filenameDateInput} type="date" value={filenameDate} onChange={(event) => onFilenameDateChange(event.target.value)} />
            <button type="button" className="datePickerButton" aria-label="Choose filename date" onClick={openFilenameDatePicker}><CalendarDays aria-hidden="true" size={18} /></button>
          </span>
        </label>
        <label className="field">
          <span>Output format</span>
          <select value={profile.outputFormat} onChange={(event) => onChange({ outputFormat: event.target.value as OutputProfileDraft["outputFormat"] })} disabled={!canEdit}>
            <option value="CSV">CSV</option>
            <option value="XLSX">XLSX</option>
          </select>
        </label>
      </div>

      <fieldset className="worksheetHandlingSettings">
        <legend>Worksheet handling</legend>
        <label><input type="radio" name="worksheet-mode" checked={worksheetMode === "COMBINE"} onChange={() => onChange({ worksheetMode: "COMBINE" })} disabled={!canEdit} /><span><strong>Combine all worksheets into one</strong><small>CSV or XLSX, with headings written once.</small></span></label>
        <label><input type="radio" name="worksheet-mode" checked={worksheetMode === "SEPARATE_WORKSHEETS"} onChange={() => onChange({ worksheetMode: "SEPARATE_WORKSHEETS" })} disabled={!canEdit || profile.outputFormat === "CSV"} /><span><strong>Keep source worksheets separate</strong><small>One XLSX workbook containing a tab for each selected worksheet.</small></span></label>
        <label><input type="radio" name="worksheet-mode" checked={worksheetMode === "SEPARATE_FILES"} onChange={() => onChange({ worksheetMode: "SEPARATE_FILES" })} disabled={!canEdit} /><span><strong>Create a separate file for each worksheet</strong><small>CSV or XLSX files; multiple files are returned in one ZIP.</small></span></label>
      </fieldset>
      {worksheetMode === "SEPARATE_WORKSHEETS" && profile.outputFormat === "CSV" ? <p className="error" role="alert">Keeping source worksheets separate requires XLSX output. Choose XLSX or another worksheet mode.</p> : null}

      <div className="worksheetSelectionPanel">
        <div className="sectionHeader compact"><div><strong>Worksheets to include</strong><p className="muted">This selection applies only to the current workbook and is not saved in the reusable profile.</p></div><div className="actions"><button className="secondary" type="button" disabled={!canEdit} onClick={() => onChange({ selectedWorksheetIds: worksheetStates.filter((worksheet) => worksheet.compatibility.compatible).map((worksheet) => worksheet.id) })}>Select all compatible</button><button className="secondary" type="button" disabled={!canEdit} onClick={() => onChange({ selectedWorksheetIds: [] })}>Clear selection</button></div></div>
        <div className="worksheetSelectionList">
          {worksheetStates.map((worksheet) => <label key={worksheet.id} className={worksheet.compatibility.compatible ? "worksheetSelection" : "worksheetSelection incompatible"}>
            <input type="checkbox" checked={selectedWorksheetIds.includes(worksheet.id)} disabled={!canEdit || (!worksheet.compatibility.compatible && !selectedWorksheetIds.includes(worksheet.id))} onChange={(event) => onChange({ selectedWorksheetIds: event.target.checked ? [...selectedWorksheetIds, worksheet.id] : selectedWorksheetIds.filter((id) => id !== worksheet.id) })} />
            <span><strong>{worksheet.name}</strong><small>{worksheet.compatibility.compatible ? "Compatible" : `Needs attention · ${worksheet.compatibility.issues.join(" ")}`}</small></span>
          </label>)}
        </div>
      </div>

      {worksheetMode !== "COMBINE" ? <fieldset className="worksheetNamingSettings">
        <legend>Worksheet names</legend>
        <label className="checkboxField"><input type="radio" name="worksheet-name-mode" checked={worksheetNameMode === "SOURCE"} onChange={() => onChange({ worksheetNameMode: "SOURCE" })} disabled={!canEdit} /><span>Keep existing worksheet names</span></label>
        <label className="checkboxField"><input type="radio" name="worksheet-name-mode" checked={worksheetNameMode === "CUSTOM"} onChange={() => onChange({ worksheetNameMode: "CUSTOM" })} disabled={!canEdit} /><span>Use custom worksheet names</span></label>
        {worksheetNameMode === "CUSTOM" ? <div className="worksheetNameGrid">{worksheetStates.map((worksheet) => <label className="field" key={worksheet.id}><span>{worksheet.name}</span><input value={worksheetNameMappings[normaliseWorksheetIdentity(worksheet.name)] ?? ""} onChange={(event) => setCustomWorksheetName(worksheet.name, event.target.value)} maxLength={31} disabled={!canEdit} placeholder={worksheet.name} /></label>)}</div> : null}
      </fieldset> : null}

      {worksheetMode === "SEPARATE_FILES" ? <div className="filenamePreview multiFilePreview" aria-live="polite">
        <FileOutput aria-hidden="true" size={20} />
        <div><span>{selectedWorksheets.length > 1 ? "Download package" : "Download file"}</span><strong>{selectedWorksheets.length > 1 ? packagePreview.finalFilename : separateFilePreviews[0] ?? "Select a worksheet"}</strong>{separateFilePreviews.slice(0, 3).map((name) => <small key={name}>{name}</small>)}{separateFilePreviews.length > 3 ? <small>+ {separateFilePreviews.length - 3} more</small> : null}</div>
      </div> : <div className="filenamePreview" aria-live="polite"><FileOutput aria-hidden="true" size={20} /><div><span>Resolved filename preview</span><strong>{resolved.finalFilename || "No valid filename"}</strong></div></div>}
      {resolved.errors.map((error) => <p className="error" role="alert" key={error}>{error}</p>)}
      {resolved.warnings.map((warning) => <p className="warningText" key={warning}><Info aria-hidden="true" size={15} /> {warning}</p>)}

      {profile.outputFormat === "CSV" ? <div className="formatSettings" aria-label="CSV settings"><label className="field"><span>Delimiter</span><select value={profile.csvDelimiter} onChange={(event) => onChange({ csvDelimiter: event.target.value as OutputProfileDraft["csvDelimiter"] })} disabled={!canEdit}>{Object.entries(delimiterLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="checkboxField"><input type="checkbox" checked={profile.csvIncludeHeader} onChange={(event) => onChange({ csvIncludeHeader: event.target.checked })} disabled={!canEdit} /><span>Include header row</span></label></div> : worksheetMode === "COMBINE" ? <div className="formatSettings" aria-label="XLSX settings"><label className="field worksheetNameField"><span>Worksheet name (optional)</span><input value={profile.xlsxWorksheetName} onChange={(event) => onChange({ xlsxWorksheetName: event.target.value })} maxLength={31} disabled={!canEdit} placeholder={effectiveWorksheetName(profile.name, "")} /><small>The tab name inside the Excel workbook. If blank, it will use “{effectiveWorksheetName(profile.name, "")}”.</small></label></div> : null}

      {contextualIssues.length > 0 ? <div className="attentionList"><strong>Before this profile can be generated:</strong><ul>{[...new Set(contextualIssues)].map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
    </section>
  );
}
