"use client";

import { ChevronDown, ChevronUp, Filter, Plus, Trash2 } from "lucide-react";
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
          <p className="sheetLabel">Row filters</p>
          <h2 id="output-profile-filters-title">Include rows where {matchMode === "ALL" ? "all of the following are true" : "any of the following is true"}</h2>
          <p className="muted">Filters may use any source heading, even if that field is not part of the output.</p>
        </div>
        {canEdit ? <button className="secondary" type="button" onClick={onAdd}><Plus aria-hidden="true" size={16} /> Add filter</button> : null}
      </div>

      <label className="filterMatchMode field">
        <span>How should multiple filters work?</span>
        <select value={matchMode} disabled={!canEdit} onChange={(event) => onMatchModeChange(event.target.value as OutputProfileFilterMatchMode)}>
          <option value="ALL">Match ALL rules</option>
          <option value="ANY">Match ANY rule</option>
        </select>
      </label>

      {filters.length > 0 ? (
        <div className="filterRuleList">
          {filters.map((filter, index) => (
            <div className="filterRule" key={filter.clientId}>
              <span className="filterRuleNumber" aria-hidden="true">{index + 1}</span>
              <label className="field">
                <span>Source heading</span>
                <select value={filter.sourceColumnIndex} disabled={!canEdit} onChange={(event) => {
                  const sourceColumnIndex = Number(event.target.value);
                  onChange(filter.clientId, { sourceColumnIndex, sourceHeading: headers[sourceColumnIndex] ?? "" });
                }}>
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
          <Filter aria-hidden="true" size={22} />
          <div><strong>All source rows are included</strong><p className="muted">Add a filter when this profile should include only selected products.</p></div>
        </div>
      )}
    </section>
  );
}
