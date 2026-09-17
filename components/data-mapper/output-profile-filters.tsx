"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { filterOperatorLabels, filterOperatorNeedsValue } from "@/lib/data-mapper/output-profiles/rules";
import { filterOperators, type OutputProfileFilterDraft, type OutputProfileFilterMatchMode } from "@/lib/data-mapper/output-profiles/types";

export function OutputProfileFilters({ headers, filters, matchMode, canEdit, onAdd, onChange, onMove, onRemove, onMatchModeChange }: {
  headers: readonly string[];
  filters: readonly OutputProfileFilterDraft[];
  matchMode: OutputProfileFilterMatchMode;
  canEdit: boolean;
  onAdd: () => void;
  onChange: (clientId: string, changes: Partial<Omit<OutputProfileFilterDraft, "clientId">>) => void;
  onMove: (clientId: string, targetIndex: number) => void;
  onRemove: (clientId: string) => void;
  onMatchModeChange: (matchMode: OutputProfileFilterMatchMode) => void;
}) {
  return (
    <section className="card outputProfileFilters" aria-labelledby="output-profile-filters-title">
      <div className="sectionHeader">
        <div>
          <p className="sheetLabel">Row rules</p>
          <h2 id="output-profile-filters-title">Which rows should be included?</h2>
        </div>
      </div>

      <label className="filterMatchMode field">
        <span>Include rows where:</span>
        <select value={matchMode} disabled={!canEdit} onChange={(event) => onMatchModeChange(event.target.value as OutputProfileFilterMatchMode)}>
          <option value="ALL">All rules match</option>
          <option value="ANY">Any rule matches</option>
        </select>
      </label>

      {filters.length > 0 ? (
        <div className="filterRuleList">
          {filters.map((filter, index) => (
            <div className="filterRule" key={filter.clientId}>
              <span className="filterRuleNumber" aria-hidden="true">{index + 1}</span>
              <label className="field">
                <span>Source heading</span>
                <select value={filter.sourceColumnIndex ?? ""} disabled={!canEdit} onChange={(event) => {
                  const sourceColumnIndex = Number(event.target.value);
                  onChange(filter.clientId, { sourceColumnIndex, sourceHeading: headers[sourceColumnIndex] ?? "" });
                }}>
                  {filter.sourceColumnIndex === null ? <option value="">Needs matching</option> : null}
                  {headers.map((heading, sourceColumnIndex) => <option key={`${heading}-${sourceColumnIndex}`} value={sourceColumnIndex}>{heading}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Condition</span>
                <select value={filter.operator} disabled={!canEdit} onChange={(event) => {
                  const operator = event.target.value as OutputProfileFilterDraft["operator"];
                  onChange(filter.clientId, { operator, comparisonValue: filterOperatorNeedsValue(operator) ? filter.comparisonValue : "" });
                }}>
                  {filterOperators.map((operator) => <option key={operator} value={operator}>{filterOperatorLabels[operator]}</option>)}
                </select>
              </label>
              {filterOperatorNeedsValue(filter.operator) ? (
                <label className="field">
                  <span>Value</span>
                  <input value={filter.comparisonValue} maxLength={500} disabled={!canEdit} onChange={(event) => onChange(filter.clientId, { comparisonValue: event.target.value })} />
                </label>
              ) : <div className="filterNoValue"><span>No comparison value needed</span></div>}
              {canEdit ? (
                <div className="filterRuleActions">
                  <button className="sheetIconButton staticPosition" type="button" onClick={() => onMove(filter.clientId, index - 1)} disabled={index === 0} aria-label={`Move filter ${index + 1} up`}><ChevronUp aria-hidden="true" size={15} /></button>
                  <button className="sheetIconButton staticPosition" type="button" onClick={() => onMove(filter.clientId, index + 1)} disabled={index === filters.length - 1} aria-label={`Move filter ${index + 1} down`}><ChevronDown aria-hidden="true" size={15} /></button>
                  <button className="sheetIconButton staticPosition dangerIconButton" type="button" onClick={() => onRemove(filter.clientId)} aria-label={`Remove filter ${index + 1}`}><Trash2 aria-hidden="true" size={15} /></button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="emptyState filterEmptyState">
          <strong>All source rows</strong>
        </div>
      )}
      {canEdit ? (
        <button className="secondary filterAddButton" type="button" onClick={onAdd} aria-label="Add row rule">
          <Plus aria-hidden="true" size={16} /> Add rule
        </button>
      ) : null}
    </section>
  );
}
