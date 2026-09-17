"use client";

import { useMemo, useRef, useState } from "react";
import type ExcelJS from "exceljs";
import { useRouter } from "next/navigation";
import { ArrowDownUp, FileSpreadsheet, LoaderCircle, Search, Upload } from "lucide-react";
import type { UploadedWorkbookDetails, ValidationIssueCategory, WorkbookSummary, WorkbookValidationResult, WorksheetPreview } from "@/lib/data-mapper/types";
import { createWorksheetPreview, friendlyExcelImportMessage, readWorkbook } from "@/lib/data-mapper/excel-import";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import { uploadSourceWorkbookDirectly } from "@/lib/data-mapper/source-workbook-direct-upload";
import { SourceWorkbookPolicyError, validateSourceWorkbookDescriptor } from "@/lib/data-mapper/source-workbook-policy";
import {
  CompactWorkbookSummary,
  SelectedWorksheetSummary,
  WorksheetTabs,
  countWorksheetIssues,
  worksheetRowValidationDescription,
  worksheetRowValidationStates,
  worksheetPreviewPanelId,
  worksheetTabId
} from "@/components/data-mapper/workbook-explorer-ui";
import { ValidationNextSteps } from "@/components/data-mapper/validation-next-steps";
import { useHorizontalPan } from "@/components/data-mapper/use-horizontal-pan";
import {
  groupValidationIssuesByRow,
  issueMatchesPreviewFilters,
  rowSeverityLabel,
  sourceCellValidationState,
  validationIssuesForWorksheet,
  type PreviewValidationFilters
} from "@/lib/data-mapper/validation-preview";

type SortDirection = "asc" | "desc";

type SortState = {
  columnIndex: number;
  direction: SortDirection;
} | null;

type PreviewDataRow = { cells: string[]; physicalRowNumber: number };

type ValidationFilters = PreviewValidationFilters;

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

export function visibleRows(preview: WorksheetPreview | null, searchTerm: string, sort: SortState) {
  if (!preview) return [];
  const normalisedSearch = searchTerm.trim().toLowerCase();
  const dataRows: PreviewDataRow[] = preview.rows.map((cells, index) => ({
    cells,
    physicalRowNumber: (preview.headerRowNumber ?? 0) + index + 1
  }));
  const filteredRows = normalisedSearch
    ? dataRows.filter((row) => row.cells.some((cell) => cell.toLowerCase().includes(normalisedSearch)))
    : dataRows;

  if (!sort) return filteredRows;
  return filteredRows.sort((left, right) => {
    const leftValue = left.cells[sort.columnIndex] ?? "";
    const rightValue = right.cells[sort.columnIndex] ?? "";
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export function WorkbookImporter({ canPrepareOutputProfiles }: { canPrepareOutputProfiles: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [summary, setSummary] = useState<WorkbookSummary | null>(null);
  const [validation, setValidation] = useState<WorkbookValidationResult | null>(null);
  const [validationFilters, setValidationFilters] = useState<ValidationFilters>({ severity: "All", category: "All" });
  const [ignoredFingerprints, setIgnoredFingerprints] = useState<Set<string>>(() => new Set());
  const [selectedFingerprints, setSelectedFingerprints] = useState<Set<string>>(() => new Set());
  const [uploadDetails, setUploadDetails] = useState<UploadedWorkbookDetails | null>(null);
  const [selectedUploadDetails, setSelectedUploadDetails] = useState<UploadedWorkbookDetails | null>(null);
  const [selectedWorksheetName, setSelectedWorksheetName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparingProfile, setIsPreparingProfile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const worksheetPreviewPan = useHorizontalPan<HTMLDivElement>();

  const selectedWorksheet = summary?.worksheets.find((worksheet) => worksheet.name === selectedWorksheetName) ?? summary?.worksheets[0] ?? null;
  const preview = useMemo(() => {
    if (!workbook || !selectedWorksheet) return null;
    const worksheet = workbook.getWorksheet(selectedWorksheet.name);
    if (!worksheet) return null;
    return createWorksheetPreview(selectedWorksheet.name, worksheet, selectedWorksheet);
  }, [selectedWorksheet, workbook]);
  const worksheetIssues = useMemo(() => validationIssuesForWorksheet(validation?.issues ?? [], selectedWorksheetName ?? "", ignoredFingerprints), [ignoredFingerprints, selectedWorksheetName, validation]);
  const matchingWorksheetIssues = useMemo(() => worksheetIssues.filter((issue) => issueMatchesPreviewFilters(issue, validationFilters)), [validationFilters, worksheetIssues]);
  const issuesByRow = useMemo(() => groupValidationIssuesByRow(matchingWorksheetIssues), [matchingWorksheetIssues]);
  const validationFilterActive = validationFilters.severity !== "All" || validationFilters.category !== "All";
  const rows = useMemo(() => visibleRows(preview, searchTerm, sort).filter((row) => !validationFilterActive || issuesByRow.has(row.physicalRowNumber)), [issuesByRow, preview, searchTerm, sort, validationFilterActive]);
  const issueCountsByWorksheet = useMemo(() => countWorksheetIssues(validation?.issues ?? []), [validation]);
  const rowValidationStates = useMemo(() => worksheetRowValidationStates(worksheetIssues, selectedWorksheetName ?? ""), [selectedWorksheetName, worksheetIssues]);

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
      validateSourceWorkbookDescriptor({ fileName: file.name, fileSizeBytes: file.size, contentType: file.type });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const result = await readWorkbook(file);
      const validationResult = validateWorkbook(result.workbook, result.summary);
      setWorkbook(result.workbook);
      setSummary(result.summary);
      setValidation(validationResult);
      setSelectedFile(file);
      setValidationFilters({ severity: "All", category: "All" });
      setIgnoredFingerprints(new Set());
      setSelectedFingerprints(new Set());
      setUploadDetails(currentUploadDetails);
      setSelectedWorksheetName(result.summary.worksheets[0]?.name ?? null);
    } catch (importError) {
      setWorkbook(null);
      setSummary(null);
      setValidation(null);
      setSelectedFile(null);
      setUploadDetails(null);
      setSelectedWorksheetName(null);
      setError(importError instanceof SourceWorkbookPolicyError ? importError.message : friendlyExcelImportMessage(importError));
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

  async function prepareOutputProfile() {
    if (!selectedFile || !canPrepareOutputProfiles || isPreparingProfile) return;
    setIsPreparingProfile(true);
    setUploadProgress(0);
    setProfileError(null);
    try {
      const result = await uploadSourceWorkbookDirectly(selectedFile, { worksheetName: selectedWorksheetName, ignoredValidationFingerprints: [...ignoredFingerprints], onProgress: setUploadProgress });
      router.push(result.mappingUrl);
    } catch (profilePreparationError) {
      setProfileError(profilePreparationError instanceof Error ? profilePreparationError.message : "The workbook could not be prepared for an Output Profile.");
      setIsPreparingProfile(false);
      setUploadProgress(null);
    }
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
          <div className="actions">{summary ? <span className="badge success">Workbook loaded</span> : <span className="badge">Ready for upload</span>}</div>
        </div>
      </section>

      {profileError ? <div className="warningBox">{profileError}</div> : null}

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
              {validation.summary.totalErrors > 0 ? (
                <p className="validationErrorGuidance" role="alert">Errors were found in the source workbook. Correct these values in the source file and upload the corrected workbook.</p>
              ) : null}
              {validation.summary.totalWarnings > 0 ? (
                <p className="validationWarningGuidance">Warnings identify values to review but do not block Output Profile design.</p>
              ) : null}
            </section>
          ) : null}

          <section className="card workbookPreviewCard">
            <div className="sectionHeader workbookPreviewHeader">
              <div>
                <h2>Worksheet preview</h2>
                <p className="muted">Choose a worksheet to inspect its first {preview?.previewRowLimit ?? 100} data rows and validation issues.</p>
              </div>
              <div className="workbookPreviewControls">
                <label className="searchBox"><Search aria-hidden="true" size={18} /><span className="visuallyHidden">Search worksheet preview</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search preview" /></label>
                <div className="validationFilters">
                  <label className="field"><span>Severity</span><select value={validationFilters.severity} onChange={(event) => setValidationFilters((current) => ({ ...current, severity: event.target.value as ValidationFilters["severity"] }))}><option>All</option><option>Error</option><option>Warning</option></select></label>
                  <label className="field"><span>Issue type</span><select value={validationFilters.category} onChange={(event) => setValidationFilters((current) => ({ ...current, category: event.target.value as ValidationFilters["category"] }))}><option>All</option>{Object.entries(validationCategoryLabels).map(([category, label]) => <option key={category} value={category}>{label}</option>)}</select></label>
                </div>
              </div>
            </div>

            <WorksheetTabs
              worksheets={summary.worksheets}
              selectedWorksheetName={selectedWorksheetName}
              issueCountsByWorksheet={issueCountsByWorksheet}
              onSelectWorksheet={selectWorksheet}
            />

            <div className="worksheetRowLegend" aria-label="Worksheet validation row legend">
              <span className="worksheetRowLegendItem rowError"><span aria-hidden="true" />Error</span>
              <span className="worksheetRowLegendItem rowWarning"><span aria-hidden="true" />Warning</span>
              <span className="worksheetRowLegendItem rowIgnoredError"><span aria-hidden="true" />Ignored error</span>
            </div>
            {validation && validation.issues.some((issue) => issue.severity === "Error") ? <div className="actions validationPreviewActions">
              <button className="secondary" type="button" disabled={selectedFingerprints.size === 0} onClick={() => setIgnoredFingerprints((current) => new Set([...current, ...selectedFingerprints]))}>Ignore selected</button>
              <button className="secondary" type="button" disabled={[...selectedFingerprints].every((fingerprint) => !ignoredFingerprints.has(fingerprint))} onClick={() => setIgnoredFingerprints((current) => { const next = new Set(current); selectedFingerprints.forEach((fingerprint) => next.delete(fingerprint)); return next; })}>Restore selected</button>
              <button className="secondary" type="button" onClick={() => setIgnoredFingerprints(new Set(validation.issues.filter((issue) => issue.severity === "Error").map((issue) => issue.fingerprint)))}>Ignore all blocking errors</button>
              <button className="secondary" type="button" disabled={ignoredFingerprints.size === 0} onClick={() => setIgnoredFingerprints(new Set())}>Restore all ignored errors</button>
            </div> : null}

            <div
              aria-labelledby={worksheetTabId(Math.max(0, summary.worksheets.findIndex((worksheet) => worksheet.name === selectedWorksheetName)))}
              className="worksheetPreviewPanel"
              id={worksheetPreviewPanelId}
              role="tabpanel"
              tabIndex={0}
            >
              {selectedWorksheet ? (
                <SelectedWorksheetSummary
                  worksheet={selectedWorksheet}
                  previewedRowCount={preview?.rows.length ?? 0}
                  issueCounts={issueCountsByWorksheet.get(selectedWorksheet.name)}
                />
              ) : null}

              {preview && preview.headers.length > 0 && (rows.length > 0 || !validationFilterActive) ? (
                <div {...worksheetPreviewPan.handlers} aria-label="Worksheet Preview horizontal table" className={`previewTableWrap horizontalPanSurface${worksheetPreviewPan.isPanning ? " isPanning" : ""}`} tabIndex={0}>
                  <table className="previewTable">
                    <thead>
                      <tr>
                        <th className="validationSelectionColumn"><span className="visuallyHidden">Select validation issues</span></th>
                        <th className="validationSeverityColumn">Severity</th>
                        <th className="validationValueColumn">Current value</th>
                        <th className="validationMessageColumn">Rule / message</th>
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
                      {rows.map((row) => {
                        const rowState = rowValidationStates.get(row.physicalRowNumber) ?? "normal";
                        const rowDescription = worksheetRowValidationDescription(rowState);
                        const rowIssues = issuesByRow.get(row.physicalRowNumber) ?? [];
                        const blockingIssues = rowIssues.filter((issue) => issue.severity === "Error");
                        const allBlockingSelected = blockingIssues.length > 0 && blockingIssues.every((issue) => selectedFingerprints.has(issue.fingerprint));
                        return (
                        <tr aria-label={`${rowDescription}, worksheet row ${row.physicalRowNumber}`} className={rowState === "normal" ? undefined : `worksheetDataRow ${rowState}`} key={`${selectedWorksheetName}-${row.physicalRowNumber}`}>
                          <td className="validationSelectionColumn">{blockingIssues.length > 0 ? <input type="checkbox" aria-label={`Select ${blockingIssues.length} blocking ${blockingIssues.length === 1 ? "issue" : "issues"} on worksheet row ${row.physicalRowNumber}`} checked={allBlockingSelected} onChange={(event) => setSelectedFingerprints((current) => { const next = new Set(current); blockingIssues.forEach((issue) => event.target.checked ? next.add(issue.fingerprint) : next.delete(issue.fingerprint)); return next; })} /> : null}</td>
                          <td className="validationSeverityColumn"><span className={rowState === "error" ? "badge danger" : rowState === "warning" ? "badge warning" : rowState === "ignored-error" ? "badge" : ""}>{rowSeverityLabel(rowIssues)}</span></td>
                          <td className="validationValueColumn"><span className="validationIssueStack">{rowIssues.slice(0, 3).map((issue) => <span key={issue.fingerprint}>{issue.currentValue || "Blank"}</span>)}{rowIssues.length > 3 ? <small>+ {rowIssues.length - 3} more</small> : null}</span></td>
                          <td className="validationMessageColumn"><span className="validationIssueStack">{rowIssues.slice(0, 3).map((issue) => <span key={issue.fingerprint}>{issue.message}</span>)}{rowIssues.length > 3 ? <small>+ {rowIssues.length - 3} more</small> : null}</span></td>
                          {preview.headers.map((header, columnIndex) => (
                            <td className={sourceCellValidationState(rowIssues, header) === "normal" ? undefined : `validationSourceCell ${sourceCellValidationState(rowIssues, header)}`} key={`${header}-${columnIndex}`}>
                              {columnIndex === 0 && rowState !== "normal" ? <span className="visuallyHidden">{rowDescription}. </span> : null}
                              {row.cells[columnIndex]}
                            </td>
                          ))}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : validationFilterActive ? (
                <div className="emptyState"><h2>No worksheet rows match these validation filters</h2><p className="muted">Adjust Severity or Issue type to review other rows.</p></div>
              ) : (
                <div className="emptyState">
                  <h2>No preview available</h2>
                  <p className="muted">Select a worksheet with detected headers and data rows.</p>
                </div>
              )}
            </div>
          </section>

          {validation && selectedFile ? (
            <ValidationNextSteps
              errorCount={validation.summary.totalErrors}
              warningCount={validation.summary.totalWarnings}
              canContinue={canPrepareOutputProfiles}
              isPreparing={isPreparingProfile}
              uploadProgress={uploadProgress}
              onUploadCorrected={() => inputRef.current?.click()}
              onContinue={prepareOutputProfile}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
