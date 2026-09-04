"use client";

import { useMemo, useRef, useState } from "react";
import type ExcelJS from "exceljs";
import { ArrowDownUp, FileSpreadsheet, LoaderCircle, Search, Upload } from "lucide-react";
import type { UploadedWorkbookDetails, ValidationIssueCategory, ValidationSeverity, WorkbookSummary, WorkbookValidationResult, WorksheetPreview } from "@/lib/data-mapper/types";
import { createWorksheetPreview, friendlyExcelImportMessage, readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import {
  CompactWorkbookSummary,
  SelectedWorksheetSummary,
  WorksheetTabs,
  worksheetPreviewPanelId,
  worksheetTabId
} from "@/components/data-mapper/workbook-explorer-ui";

type SortDirection = "asc" | "desc";

type SortState = {
  columnIndex: number;
  direction: SortDirection;
} | null;

type ValidationFilters = {
  severity: "All" | ValidationSeverity;
  category: "All" | ValidationIssueCategory;
  worksheetName: "All" | string;
};

const validationCategoryLabels: Record<ValidationIssueCategory, string> = {
  "duplicate-sku": "Duplicate SKU",
  "missing-required-field": "Missing required field",
  price: "Price issue",
  margin: "Margin issue",
  "approval-status": "Approval status"
};

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
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [summary, setSummary] = useState<WorkbookSummary | null>(null);
  const [validation, setValidation] = useState<WorkbookValidationResult | null>(null);
  const [validationFilters, setValidationFilters] = useState<ValidationFilters>({ severity: "All", category: "All", worksheetName: "All" });
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [uploadDetails, setUploadDetails] = useState<UploadedWorkbookDetails | null>(null);
  const [selectedUploadDetails, setSelectedUploadDetails] = useState<UploadedWorkbookDetails | null>(null);
  const [selectedWorksheetName, setSelectedWorksheetName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorksheet = summary?.worksheets.find((worksheet) => worksheet.name === selectedWorksheetName) ?? summary?.worksheets[0] ?? null;
  const preview = useMemo(() => {
    if (!workbook || !selectedWorksheet) return null;
    const worksheet = workbook.getWorksheet(selectedWorksheet.name);
    if (!worksheet) return null;
    return createWorksheetPreview(selectedWorksheet.name, worksheet, selectedWorksheet);
  }, [selectedWorksheet, workbook]);
  const rows = useMemo(() => visibleRows(preview, searchTerm, sort), [preview, searchTerm, sort]);
  const filteredIssues = useMemo(() => {
    if (!validation) return [];
    return validation.issues.filter((issue) => {
      const severityMatch = validationFilters.severity === "All" || issue.severity === validationFilters.severity;
      const categoryMatch = validationFilters.category === "All" || issue.category === validationFilters.category;
      const worksheetMatch = validationFilters.worksheetName === "All" || issue.worksheetName === validationFilters.worksheetName;
      return severityMatch && categoryMatch && worksheetMatch;
    });
  }, [validation, validationFilters]);

  async function handleFile(file: File) {
    setIsLoading(true);
    setError(null);
    setSearchTerm("");
    setSort(null);
    const currentUploadDetails = {
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toISOString()
    };
    setSelectedUploadDetails(currentUploadDetails);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const result = await readWorkbook(file);
      const validationResult = validateWorkbook(result.workbook, result.summary);
      setWorkbook(result.workbook);
      setSummary(result.summary);
      setValidation(validationResult);
      setValidationFilters({ severity: "All", category: "All", worksheetName: "All" });
      setSelectedIssueId(null);
      setUploadDetails(currentUploadDetails);
      setSelectedWorksheetName(result.summary.worksheets[0]?.name ?? null);
    } catch (importError) {
      setWorkbook(null);
      setSummary(null);
      setValidation(null);
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

  function selectWorksheet(worksheetName: string) {
    setSelectedWorksheetName(worksheetName);
    setSearchTerm("");
    setSort(null);
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
            <p className="muted">Drop an Excel workbook here, or browse for a .xlsx or .xlsm file. Legacy .xls files should be saved in a modern Excel format first.</p>
            {selectedUploadDetails ? (
              <div className="selectedWorkbook">
                <strong title={selectedUploadDetails.fileName}>{selectedUploadDetails.fileName}</strong>
                <span>{formatFileSize(selectedUploadDetails.fileSize)} · Selected {formatDateTime(selectedUploadDetails.uploadedAt)}</span>
              </div>
            ) : null}
            <div className="actions">
              <button className="primary" type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
                {isLoading ? <LoaderCircle aria-hidden="true" size={18} className="spinIcon" /> : <FileSpreadsheet aria-hidden="true" size={18} />}
                {isLoading ? "Importing" : "Browse for file"}
              </button>
              <a className="secondary" href="/demo/Axiom_Data_Mapper_Demo_Pricebook_20000_Rows_exceljs.xlsx" download>
                Demo workbook
              </a>
            </div>
          </div>
          <input
            ref={inputRef}
            className="visuallyHidden"
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </div>
        {error ? <div className="warningBox">{error}</div> : null}
      </section>

      {summary && uploadDetails ? (
        <>
          <CompactWorkbookSummary
            fileName={uploadDetails.fileName}
            fileSize={formatFileSize(uploadDetails.fileSize)}
            worksheetCount={summary.worksheetCount}
            totalRows={summary.totalRows}
            totalColumns={summary.totalColumns}
          />

          {validation ? (
            <section className="card">
              <div className="sectionHeader">
                <div>
                  <h2>Validation summary</h2>
                  <p className="muted">Sensible default checks run after import. Margin warning threshold is 20%.</p>
                </div>
                <span className={validation.summary.totalErrors > 0 ? "badge danger" : validation.summary.totalWarnings > 0 ? "badge warning" : "badge success"}>
                  {validation.summary.totalErrors > 0 ? "Errors found" : validation.summary.totalWarnings > 0 ? "Warnings found" : "No issues"}
                </span>
              </div>
              <div className="summaryGrid">
                <div><strong>{validation.summary.totalRowsChecked.toLocaleString("en-GB")}</strong><span>Total rows checked</span></div>
                <div><strong>{validation.summary.totalErrors.toLocaleString("en-GB")}</strong><span>Total errors</span></div>
                <div><strong>{validation.summary.totalWarnings.toLocaleString("en-GB")}</strong><span>Total warnings</span></div>
                <div><strong>{validation.summary.worksheetsWithIssues.toLocaleString("en-GB")}</strong><span>Worksheets with issues</span></div>
                <div><strong>{validation.summary.duplicateSkuCount.toLocaleString("en-GB")}</strong><span>Duplicate SKUs</span></div>
                <div><strong>{validation.summary.missingRequiredFieldCount.toLocaleString("en-GB")}</strong><span>Missing required fields</span></div>
                <div><strong>{validation.summary.priceIssueCount.toLocaleString("en-GB")}</strong><span>Price issues</span></div>
                <div><strong>{validation.summary.marginIssueCount.toLocaleString("en-GB")}</strong><span>Margin issues</span></div>
              </div>
            </section>
          ) : null}

          <section className="card workbookPreviewCard">
            <div className="sectionHeader workbookPreviewHeader">
              <div>
                <h2>Worksheet preview</h2>
                <p className="muted">Choose a worksheet to inspect its first {preview?.previewRowLimit ?? 100} data rows.</p>
              </div>
              <label className="searchBox">
                <Search aria-hidden="true" size={18} />
                <span className="visuallyHidden">Search worksheet preview</span>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search preview" />
              </label>
            </div>

            <WorksheetTabs
              worksheets={summary.worksheets}
              selectedWorksheetName={selectedWorksheetName}
              onSelectWorksheet={selectWorksheet}
            />

            <div
              aria-labelledby={worksheetTabId(Math.max(0, summary.worksheets.findIndex((worksheet) => worksheet.name === selectedWorksheetName)))}
              className="worksheetPreviewPanel"
              id={worksheetPreviewPanelId}
              role="tabpanel"
              tabIndex={0}
            >
              {selectedWorksheet ? (
                <SelectedWorksheetSummary worksheet={selectedWorksheet} previewedRowCount={preview?.rows.length ?? 0} />
              ) : null}

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
            </div>
          </section>

          {validation ? (
            <section className="card">
              <div className="sectionHeader">
                <div>
                  <h2>Validation issues</h2>
                  <p className="muted">{filteredIssues.length.toLocaleString("en-GB")} of {validation.issues.length.toLocaleString("en-GB")} issues shown.</p>
                </div>
                <div className="validationFilters">
                  <label className="field">
                    <span>Severity</span>
                    <select value={validationFilters.severity} onChange={(event) => setValidationFilters((current) => ({ ...current, severity: event.target.value as ValidationFilters["severity"] }))}>
                      <option>All</option>
                      <option>Error</option>
                      <option>Warning</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Issue type</span>
                    <select value={validationFilters.category} onChange={(event) => setValidationFilters((current) => ({ ...current, category: event.target.value as ValidationFilters["category"] }))}>
                      <option>All</option>
                      {Object.entries(validationCategoryLabels).map(([category, label]) => (
                        <option key={category} value={category}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Worksheet</span>
                    <select value={validationFilters.worksheetName} onChange={(event) => setValidationFilters((current) => ({ ...current, worksheetName: event.target.value }))}>
                      <option>All</option>
                      {summary.worksheets.map((worksheet) => (
                        <option key={worksheet.name} value={worksheet.name}>{worksheet.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {filteredIssues.length > 0 ? (
                <div className="previewTableWrap validationIssueWrap">
                  <table className="previewTable validationIssueTable">
                    <thead>
                      <tr><th>Severity</th><th>Worksheet</th><th>Row</th><th>SKU</th><th>Field</th><th>Issue</th></tr>
                    </thead>
                    <tbody>
                      {filteredIssues.map((issue) => (
                        <tr className={selectedIssueId === issue.id ? "selectedIssue" : undefined} key={issue.id} onClick={() => setSelectedIssueId(issue.id)}>
                          <td><span className={issue.severity === "Error" ? "badge danger" : "badge warning"}>{issue.severity}</span></td>
                          <td>{issue.worksheetName}</td>
                          <td>{issue.rowNumber}</td>
                          <td>{issue.sku ?? "Not provided"}</td>
                          <td>{issue.field}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="emptyState">
                  <h2>No issues match these filters</h2>
                  <p className="muted">Adjust the filters to review other validation results.</p>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
