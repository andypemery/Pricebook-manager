"use client";

import { useRef, type KeyboardEvent } from "react";
import type { WorksheetSummary } from "@/lib/data-mapper/types";

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
  onSelectWorksheet: (worksheetName: string) => void;
};

type SelectedWorksheetSummaryProps = {
  worksheet: WorksheetSummary;
  previewedRowCount: number;
};

export const worksheetPreviewPanelId = "worksheet-preview-panel";

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

export function WorksheetTabs({ worksheets, selectedWorksheetName, onSelectWorksheet }: WorksheetTabsProps) {
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
    <div className="worksheetTabsScroller">
      <div className="worksheetTabs" role="tablist" aria-label="Workbook worksheets">
        {worksheets.map((worksheet, index) => {
          const isSelected = worksheet.name === selectedWorksheetName;
          return (
            <button
              aria-controls={worksheetPreviewPanelId}
              aria-selected={isSelected}
              className="worksheetTab"
              id={worksheetTabId(index)}
              key={worksheet.name}
              onClick={() => onSelectWorksheet(worksheet.name)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              title={worksheet.name}
              type="button"
            >
              <span className="worksheetTabName">{worksheet.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SelectedWorksheetSummary({ worksheet, previewedRowCount }: SelectedWorksheetSummaryProps) {
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
      <span className={worksheet.importStatus === "Ready" ? "badge success" : "badge warning"}>{worksheet.importStatus}</span>
    </div>
  );
}
