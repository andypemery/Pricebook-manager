"use client";

import { useMemo, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import { ArrowDownUp, FileSpreadsheet, LoaderCircle, Search, Upload } from "lucide-react";
import type { UploadedWorkbookDetails, WorkbookSummary, WorksheetPreview } from "@/lib/data-mapper/types";
import { createWorksheetPreview, friendlyExcelImportMessage, readWorkbook } from "@/lib/data-mapper/excel-import";

type SortDirection = "asc" | "desc";

type SortState = {
  columnIndex: number;
  direction: SortDirection;
} | null;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function visibleRows(preview: WorksheetPreview | null, searchTerm: string, sort: SortState) {
  if (!preview) return [];
  const normalisedSearch = searchTerm.trim().toLowerCase();
  const filteredRows = normalisedSearch
    ? preview.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(normalisedSearch)))
    : [...preview.rows];

  if (!sort) return filteredRows;
  return filteredRows.sort((left, right) => {
    const leftValue = left[sort.columnIndex] ?? "";
    const rightValue = right[sort.columnIndex] ?? "";
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export function WorkbookImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [summary, setSummary] = useState<WorkbookSummary | null>(null);
  const [uploadDetails, setUploadDetails] = useState<UploadedWorkbookDetails | null>(null);
  const [selectedWorksheetName, setSelectedWorksheetName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorksheet = summary?.worksheets.find((worksheet) => worksheet.name === selectedWorksheetName) ?? summary?.worksheets[0] ?? null;
  const preview = useMemo(() => {
    if (!workbook || !selectedWorksheet) return null;
    const worksheet = workbook.Sheets[selectedWorksheet.name];
    if (!worksheet) return null;
    return createWorksheetPreview(selectedWorksheet.name, worksheet, selectedWorksheet);
  }, [selectedWorksheet, workbook]);
  const rows = useMemo(() => visibleRows(preview, searchTerm, sort), [preview, searchTerm, sort]);

  async function handleFile(file: File) {
    setIsLoading(true);
    setError(null);
    setSearchTerm("");
    setSort(null);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const result = await readWorkbook(file);
      setWorkbook(result.workbook);
      setSummary(result.summary);
      setUploadDetails({
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date().toISOString()
      });
      setSelectedWorksheetName(result.summary.worksheets[0]?.name ?? null);
    } catch (importError) {
      setWorkbook(null);
      setSummary(null);
      setUploadDetails(null);
      setSelectedWorksheetName(null);
      setError(friendlyExcelImportMessage(importError));
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFiles(files: FileList | null) {
    const [file] = Array.from(files ?? []);
    if (file) void handleFile(file);
  }

  function updateSort(columnIndex: number) {
    setSort((current) => {
      if (!current || current.columnIndex !== columnIndex) return { columnIndex, direction: "asc" };
      return { columnIndex, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <>
      <section className="hero">
        <div className="splitHero">
          <div>
            <p className="breadcrumb">Workbook Explorer</p>
            <h1>Excel import engine</h1>
            <p>Import Excel workbooks, inspect worksheet structure and preview the first 100 data rows before mapping or validation.</p>
          </div>
          {summary ? <span className="badge success">Workbook loaded</span> : <span className="badge">Ready for upload</span>}
        </div>
      </section>

      <section className="card">
        <div
          className={isDragging ? "workbookDropzone active" : "workbookDropzone"}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
        >
          <span className="dropzoneIcon"><Upload aria-hidden="true" size={28} /></span>
          <div>
            <h2>Upload workbook</h2>
            <p className="muted">Drop an Excel workbook here, or browse for a .xlsx, .xls or .xlsm file.</p>
            <div className="actions">
              <button className="primary" type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
                {isLoading ? <LoaderCircle aria-hidden="true" size={18} className="spinIcon" /> : <FileSpreadsheet aria-hidden="true" size={18} />}
                {isLoading ? "Importing" : "Browse for file"}
              </button>
            </div>
          </div>
          <input
            ref={inputRef}
            className="visuallyHidden"
            type="file"
            accept=".xlsx,.xls,.xlsm"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </div>
        {error ? <div className="warningBox">{error}</div> : null}
      </section>

      {summary && uploadDetails ? (
        <>
          <section className="card">
            <div className="sectionHeader">
              <h2>Upload summary</h2>
              <span className="badge">{summary.worksheetCount} worksheets</span>
            </div>
            <div className="summaryGrid">
              <div><strong>{uploadDetails.fileName}</strong><span>Filename</span></div>
              <div><strong>{formatFileSize(uploadDetails.fileSize)}</strong><span>File size</span></div>
              <div><strong>{formatDateTime(uploadDetails.uploadedAt)}</strong><span>Upload time</span></div>
              <div><strong>{summary.workbookName}</strong><span>Workbook name</span></div>
              <div><strong>{summary.worksheetCount.toLocaleString("en-GB")}</strong><span>Worksheets</span></div>
              <div><strong>{summary.totalRows.toLocaleString("en-GB")}</strong><span>Total rows</span></div>
              <div><strong>{summary.totalColumns.toLocaleString("en-GB")}</strong><span>Total columns</span></div>
            </div>
          </section>

          <div className="workbookExplorerLayout">
            <section className="card">
              <div className="sectionHeader">
                <h2>Workbook</h2>
                <span className="muted">{summary.workbookName}</span>
              </div>
              <div className="worksheetList">
                {summary.worksheets.map((worksheet) => (
                  <button
                    className={worksheet.name === selectedWorksheetName ? "worksheetButton active" : "worksheetButton"}
                    key={worksheet.name}
                    type="button"
                    onClick={() => {
                      setSelectedWorksheetName(worksheet.name);
                      setSearchTerm("");
                      setSort(null);
                    }}
                  >
                    <span>
                      <strong>{worksheet.name}</strong>
                      <small>{worksheet.rowCount.toLocaleString("en-GB")} rows, {worksheet.columnCount.toLocaleString("en-GB")} columns</small>
                    </span>
                    <span className={worksheet.importStatus === "Ready" ? "badge success" : "badge warning"}>{worksheet.importStatus}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="sectionHeader">
                <h2>Worksheet information</h2>
                {selectedWorksheet ? <span className="badge">{selectedWorksheet.importStatus}</span> : null}
              </div>
              {selectedWorksheet ? (
                <div className="summaryGrid">
                  <div><strong>{selectedWorksheet.name}</strong><span>Worksheet name</span></div>
                  <div><strong>{selectedWorksheet.rowCount.toLocaleString("en-GB")}</strong><span>Rows</span></div>
                  <div><strong>{selectedWorksheet.columnCount.toLocaleString("en-GB")}</strong><span>Columns</span></div>
                  <div><strong>{selectedWorksheet.detectedHeaderRow ?? "None"}</strong><span>Detected header row</span></div>
                </div>
              ) : null}
              {selectedWorksheet?.message ? <p className="muted">{selectedWorksheet.message}</p> : null}
            </section>
          </div>

          <section className="card">
            <div className="sectionHeader">
              <div>
                <h2>Worksheet preview</h2>
                <p className="muted">Showing up to {preview?.previewRowLimit ?? 100} rows from {preview?.sourceRowCount.toLocaleString("en-GB") ?? 0} source rows.</p>
              </div>
              <label className="searchBox">
                <Search aria-hidden="true" size={18} />
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search preview" />
              </label>
            </div>

            {preview && preview.headers.length > 0 ? (
              <div className="previewTableWrap">
                <table className="previewTable">
                  <thead>
                    <tr>
                      {preview.headers.map((header, index) => (
                        <th key={`${header}-${index}`}>
                          <button type="button" onClick={() => updateSort(index)}>
                            <span>{header}</span>
                            <ArrowDownUp aria-hidden="true" size={14} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`${selectedWorksheetName}-${rowIndex}`}>
                        {preview.headers.map((header, columnIndex) => (
                          <td key={`${header}-${columnIndex}`}>{row[columnIndex]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="emptyState">
                <h2>No preview available</h2>
                <p className="muted">Select a worksheet with detected headers and data rows.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
