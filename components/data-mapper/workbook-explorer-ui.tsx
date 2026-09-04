"use client";

import { useRef, type KeyboardEvent } from "react";
import type { ValidationIssue, WorksheetSummary } from "@/lib/data-mapper/types";

export type WorksheetIssueCounts = {
  errorCount: number;
  warningCount: number;
};

type CompactWorkbookSummaryProps = {
  fileName: string;
  fileSize: string;
  worksheetCount: number;
  totalRows: number;
  totalColumns: number;
};

type WorksheetTabsProps = {
  worksheets: WorksheetSummary[];
  selectedWorksheetName: string | null;
  issueCountsByWorksheet: ReadonlyMap<string, WorksheetIssueCounts>;
  onSelectWorksheet: (worksheetName: string) => void;
};

type SelectedWorksheetSummaryProps = {
  worksheet: WorksheetSummary;
  previewedRowCount: number;
  issueCounts?: WorksheetIssueCounts;
};

export const worksheetPreviewPanelId = "worksheet-preview-panel";
const noWorksheetIssues: WorksheetIssueCounts = { errorCount: 0, warningCount: 0 };

function countLabel(count: number, singular: string) {
  return `${count.toLocaleString("en-GB")} ${singular}${count === 1 ? "" : "s"}`;
}

function worksheetIssueDescription({ errorCount, warningCount }: WorksheetIssueCounts) {
  const descriptions: string[] = [];
  if (errorCount > 0) descriptions.push(countLabel(errorCount, "error"));
  if (warningCount > 0) descriptions.push(countLabel(warningCount, "warning"));
  return descriptions.length > 0 ? descriptions.join(", ") : "No validation issues";
}

function worksheetIssueClassName({ errorCount, warningCount }: WorksheetIssueCounts) {
  if (errorCount > 0 && warningCount > 0) return "hasErrorsAndWarnings";
  if (errorCount > 0) return "hasErrors";
  if (warningCount > 0) return "hasWarnings";
  return "";
}

export function countWorksheetIssues(issues: readonly Pick<ValidationIssue, "worksheetName" | "severity">[]) {
  const issueCounts = new Map<string, WorksheetIssueCounts>();

  for (const issue of issues) {
    const current = issueCounts.get(issue.worksheetName) ?? { errorCount: 0, warningCount: 0 };
    if (issue.severity === "Error") current.errorCount += 1;
    if (issue.severity === "Warning") current.warningCount += 1;
    issueCounts.set(issue.worksheetName, current);
  }

  return issueCounts;
}

export function worksheetTabId(index: number) {
  return `worksheet-tab-${index}`;
}

export function nextWorksheetTabIndex(currentIndex: number, key: string, worksheetCount: number) {
  if (worksheetCount === 0) return null;
  if (key === "ArrowRight") return (currentIndex + 1) % worksheetCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + worksheetCount) % worksheetCount;
  if (key === "Home") return 0;
  if (key === "End") return worksheetCount - 1;
  return null;
}

export function CompactWorkbookSummary({
  fileName,
  fileSize,
  worksheetCount,
  totalRows,
  totalColumns
}: CompactWorkbookSummaryProps) {
  return (
    <section className="card workbookSummaryCard" aria-labelledby="workbook-summary-heading">
      <h2 className="visuallyHidden" id="workbook-summary-heading">Workbook summary</h2>
      <div className="compactWorkbookSummary">
        <div className="workbookSummaryIdentity">
          <span className="workbookSummaryLabel">Workbook</span>
          <strong className="workbookSummaryName" title={fileName}>{fileName}</strong>
        </div>
        <p className="workbookSummaryMetrics">
          <span>{fileSize}</span>
          <span aria-hidden="true">·</span>
          <span>{worksheetCount.toLocaleString("en-GB")} worksheets</span>
          <span aria-hidden="true">·</span>
          <span>{totalRows.toLocaleString("en-GB")} rows</span>
          <span aria-hidden="true">·</span>
          <span>{totalColumns.toLocaleString("en-GB")} columns</span>
        </p>
      </div>
    </section>
  );
}

export function WorksheetTabs({ worksheets, selectedWorksheetName, issueCountsByWorksheet, onSelectWorksheet }: WorksheetTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const nextIndex = nextWorksheetTabIndex(currentIndex, event.key, worksheets.length);
    if (nextIndex === null) return;

    event.preventDefault();
    const nextWorksheet = worksheets[nextIndex];
    if (!nextWorksheet) return;

    onSelectWorksheet(nextWorksheet.name);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="worksheetTabsWrap">
      <div className="worksheetTabs" role="tablist" aria-label="Workbook worksheets">
        {worksheets.map((worksheet, index) => {
          const isSelected = worksheet.name === selectedWorksheetName;
          const issueCounts = issueCountsByWorksheet.get(worksheet.name) ?? noWorksheetIssues;
          const issueClassName = worksheetIssueClassName(issueCounts);
          const issueDescription = worksheetIssueDescription(issueCounts);
          return (
            <button
              aria-controls={worksheetPreviewPanelId}
              aria-label={`${worksheet.name} — ${issueDescription}`}
              aria-selected={isSelected}
              className={issueClassName ? `worksheetTab ${issueClassName}` : "worksheetTab"}
              id={worksheetTabId(index)}
              key={worksheet.name}
              onClick={() => onSelectWorksheet(worksheet.name)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              title={`${worksheet.name} — ${issueDescription}`}
              type="button"
            >
              <span className="worksheetTabName">{worksheet.name}</span>
              {issueCounts.errorCount > 0 || issueCounts.warningCount > 0 ? (
                <span className="worksheetTabIssueCounts" aria-hidden="true">
                  {issueCounts.errorCount > 0 ? <span className="worksheetTabIssueCount errorIssueCount">{countLabel(issueCounts.errorCount, "error")}</span> : null}
                  {issueCounts.warningCount > 0 ? <span className="worksheetTabIssueCount warningIssueCount">{countLabel(issueCounts.warningCount, "warning")}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SelectedWorksheetSummary({ worksheet, previewedRowCount, issueCounts = noWorksheetIssues }: SelectedWorksheetSummaryProps) {
  const hasValidationIssues = issueCounts.errorCount > 0 || issueCounts.warningCount > 0;

  return (
    <div className="selectedWorksheetSummary">
      <div className="selectedWorksheetDetails">
        <div className="selectedWorksheetTitle">
          <span>Selected sheet</span>
          <strong title={worksheet.name}>{worksheet.name}</strong>
        </div>
        <p className="selectedWorksheetMeta">
          <span>{worksheet.rowCount.toLocaleString("en-GB")} rows</span>
          <span aria-hidden="true">·</span>
          <span>{worksheet.columnCount.toLocaleString("en-GB")} columns</span>
          <span aria-hidden="true">·</span>
          <span>{previewedRowCount.toLocaleString("en-GB")} rows previewed</span>
          <span aria-hidden="true">·</span>
          <span>{worksheet.detectedHeaderRow === null ? "Header not detected" : `Header row ${worksheet.detectedHeaderRow.toLocaleString("en-GB")}`}</span>
        </p>
        {worksheet.message ? <p className="selectedWorksheetMessage">{worksheet.message}</p> : null}
      </div>
      <div
        aria-label={`Selected worksheet validation: ${worksheetIssueDescription(issueCounts)}`}
        aria-live="polite"
        className="selectedWorksheetIndicators"
      >
        {issueCounts.errorCount > 0 ? <span className="badge danger">Errors: {issueCounts.errorCount.toLocaleString("en-GB")}</span> : null}
        {issueCounts.warningCount > 0 ? <span className="badge warning">Warnings: {issueCounts.warningCount.toLocaleString("en-GB")}</span> : null}
        {!hasValidationIssues ? <span className="badge success">No issues found</span> : null}
        <span aria-label={`Import status: ${worksheet.importStatus}`} className={worksheet.importStatus === "Ready" ? "badge success" : "badge warning"}>{worksheet.importStatus}</span>
      </div>
    </div>
  );
}
