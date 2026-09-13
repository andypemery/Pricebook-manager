"use client";

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { adjustmentLabels } from "@/lib/data-mapper/output-profiles/rules";
import { adjustmentTypes, type OutputProfileColumnDraft, type RoundingDecimalPlaces } from "@/lib/data-mapper/output-profiles/types";

const roundingOptions = [0, 1, 2, 3, 4] as const;

function adjustmentValueLabel(adjustmentType: OutputProfileColumnDraft["adjustmentType"]) {
  if (adjustmentType === "MULTIPLY") return "Multiplier";
  if (adjustmentType === "DIVIDE") return "Divisor";
  return "Percentage";
}

export function OutputColumnInspector({ column, columnIndex, columnCount, canEdit, onChange, onMove, onRemove }: {
  column: OutputProfileColumnDraft;
  columnIndex: number;
  columnCount: number;
  canEdit: boolean;
  onChange: (changes: Partial<Omit<OutputProfileColumnDraft, "clientId" | "columnType" | "sourceColumnIndex" | "sourceHeading">>) => void;
  onMove: (targetIndex: number) => void;
  onRemove: () => void;
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
            <div className="sourceHeadingReference"><span>Original source heading</span><strong>{column.sourceHeading}</strong></div>
            <label className="field">
              <span>Value adjustment</span>
              <select value={column.adjustmentType} disabled={!canEdit} onChange={(event) => onChange({ adjustmentType: event.target.value as OutputProfileColumnDraft["adjustmentType"], adjustmentValue: "" })}>
                {adjustmentTypes.map((type) => <option key={type} value={type}>{adjustmentLabels[type]}</option>)}
              </select>
            </label>
            {column.adjustmentType !== "NONE" ? (
              <label className="field">
                <span>{adjustmentValueLabel(column.adjustmentType)}</span>
                <div className="numericInputWithSuffix">
                  <input value={column.adjustmentValue} inputMode="decimal" disabled={!canEdit} onChange={(event) => onChange({ adjustmentValue: event.target.value })} placeholder={column.adjustmentType.includes("PERCENT") ? "18" : "0.82"} />
                  {column.adjustmentType.includes("PERCENT") ? <span aria-hidden="true">%</span> : null}
                </div>
              </label>
            ) : null}
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

      {canEdit ? (
        <div className="actions outputColumnActions">
          <button className="secondary" type="button" onClick={() => onMove(columnIndex - 1)} disabled={columnIndex === 0}><ChevronLeft aria-hidden="true" size={16} /> Move left</button>
          <button className="secondary" type="button" onClick={() => onMove(columnIndex + 1)} disabled={columnIndex === columnCount - 1}>Move right <ChevronRight aria-hidden="true" size={16} /></button>
          <button className="dangerButton" type="button" onClick={onRemove}><Trash2 aria-hidden="true" size={16} /> Remove column</button>
        </div>
      ) : null}
    </div>
  );
}
