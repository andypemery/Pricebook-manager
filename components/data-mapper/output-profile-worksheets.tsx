"use client";

import { useMemo } from "react";
import type { OutputProfileDraft, SourceWorkbookWorksheet } from "@/lib/data-mapper/output-profiles/types";
import { resolveWorksheetCompatibility } from "@/lib/data-mapper/output-profiles/worksheet-compatibility";

export function OutputProfileWorksheets({ profile, worksheets, canEdit, onChange }: {
  profile: OutputProfileDraft;
  worksheets: SourceWorkbookWorksheet[];
  canEdit: boolean;
  onChange: (selectedWorksheetIds: string[]) => void;
}) {
  const selectedWorksheetIds = profile.selectedWorksheetIds ?? worksheets.slice(0, 1).map((worksheet) => worksheet.id);
  const worksheetStates = useMemo(() => worksheets.map((worksheet) => ({
    ...worksheet,
    compatibility: resolveWorksheetCompatibility(profile, worksheet.headers)
  })), [profile, worksheets]);
  const compatibleIds = worksheetStates
    .filter((worksheet) => worksheet.compatibility.compatible)
    .map((worksheet) => worksheet.id);
  const selectedCount = worksheetStates.filter((worksheet) => selectedWorksheetIds.includes(worksheet.id)).length;

  return (
    <div className="card worksheetSelectionPanel" aria-labelledby="worksheets-title">
      <div className="sectionHeader compact">
        <div>
          <p className="sheetLabel">Current workbook</p>
          <h2 id="worksheets-title">Worksheets</h2>
          <p className="muted">Which source worksheets should be included?</p>
        </div>
        <strong className="worksheetSelectionCount">{selectedCount} of {worksheetStates.length} worksheets selected</strong>
      </div>
      <div className="worksheetSelectionActions">
        <button className="linkButton" type="button" disabled={!canEdit} onClick={() => onChange(compatibleIds)}>Select all compatible</button>
        <span aria-hidden="true">·</span>
        <button className="linkButton" type="button" disabled={!canEdit} onClick={() => onChange([])}>Clear selection</button>
      </div>
      <div className="worksheetSelectionList">
        {worksheetStates.map((worksheet) => {
          const title = worksheet.compatibility.compatible
            ? worksheet.name
            : `${worksheet.name}: ${worksheet.compatibility.issues.join(" ")}`;
          const checked = selectedWorksheetIds.includes(worksheet.id);
          return (
            <label key={worksheet.id} title={title} className={worksheet.compatibility.compatible ? "worksheetSelection" : "worksheetSelection incompatible"}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!canEdit || (!worksheet.compatibility.compatible && !checked)}
                onChange={(event) => onChange(event.target.checked
                  ? [...selectedWorksheetIds, worksheet.id]
                  : selectedWorksheetIds.filter((id) => id !== worksheet.id))}
              />
              <span>{worksheet.compatibility.compatible ? worksheet.name : `⚠ ${worksheet.name}`}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
