"use client";

import { adjustmentLabels } from "@/lib/data-mapper/output-profiles/rules";
import { adjustmentTypes, type OutputProfileColumnDraft, type RoundingDecimalPlaces } from "@/lib/data-mapper/output-profiles/types";

const roundingOptions = [0, 1, 2, 3, 4, 5, 6] as const;

function adjustmentValueLabel(adjustmentType: OutputProfileColumnDraft["adjustmentType"]) {
  if (adjustmentType === "MULTIPLY") return "Multiplier";
  if (adjustmentType === "DIVIDE") return "Divisor";
  return "Percentage";
}

export function OutputColumnInspector({ column, canEdit, onChange }: {
  column: OutputProfileColumnDraft;
  canEdit: boolean;
  onChange: (changes: Partial<Omit<OutputProfileColumnDraft, "clientId" | "columnType" | "sourceColumnIndex" | "sourceHeading">>) => void;
}) {
  const isStatic = column.columnType === "STATIC";
  return (
    <div className="outputColumnInspector" aria-label="Selected output column settings">
      <div className="outputColumnFields">
        <label className="field">
          <span>Output heading</span>
          <input value={column.outputHeading} maxLength={200} disabled={!canEdit} onChange={(event) => onChange({ outputHeading: event.target.value })} />
        </label>

        {isStatic ? (
          <>
            <div className="sourceHeadingReference"><span>Type</span><strong>Fixed value</strong></div>
            <label className="field">
              <span>Fixed value</span>
              <input value={column.staticValue} maxLength={500} disabled={!canEdit} onChange={(event) => onChange({ staticValue: event.target.value })} placeholder="For example, GBP" />
            </label>
          </>
        ) : (
          <>
            <div className="sourceHeadingReference"><span>Source heading</span><strong>{column.sourceHeading}</strong></div>
            <label className="field">
              <span>Value adjustment</span>
              <select value={column.adjustmentType} disabled={!canEdit} onChange={(event) => onChange({ adjustmentType: event.target.value as OutputProfileColumnDraft["adjustmentType"], adjustmentValue: "" })}>
                {adjustmentTypes.map((type) => <option key={type} value={type}>{adjustmentLabels[type]}</option>)}
              </select>
            </label>
            <label className="field adjustmentValueField">
              <span>{column.adjustmentType === "NONE" ? "Value" : adjustmentValueLabel(column.adjustmentType)}</span>
              <div className="numericInputWithSuffix">
                <input value={column.adjustmentValue} inputMode="decimal" disabled={!canEdit || column.adjustmentType === "NONE"} onChange={(event) => onChange({ adjustmentValue: event.target.value })} placeholder={column.adjustmentType === "NONE" ? "Not required" : column.adjustmentType.includes("PERCENT") ? "18" : "0.82"} />
                {column.adjustmentType.includes("PERCENT") ? <span aria-hidden="true">%</span> : null}
              </div>
            </label>
            <label className="field">
              <span>Rounding</span>
              <select value={column.roundingDecimalPlaces ?? ""} disabled={!canEdit} onChange={(event) => onChange({ roundingDecimalPlaces: event.target.value === "" ? null : Number(event.target.value) as RoundingDecimalPlaces })}>
                <option value="">No explicit rounding</option>
                {roundingOptions.map((places) => <option key={places} value={places}>{places} decimal {places === 1 ? "place" : "places"}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
