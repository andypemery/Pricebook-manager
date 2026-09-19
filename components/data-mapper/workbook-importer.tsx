"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type ExcelJS from "exceljs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownUp, FileSpreadsheet, LoaderCircle, Search, Upload } from "lucide-react";
import { updateSourceRowExclusionsAction } from "@/lib/actions/source-row-exclusion.actions";
import { updateValidationIssueOverridesAction } from "@/lib/actions/validation-override.actions";
import type { UploadedWorkbookDetails, ValidationIssueCategory, WorkbookSummary, WorkbookValidationResult, WorksheetPreview } from "@/lib/data-mapper/types";
import { createWorksheetPreview, friendlyExcelImportMessage, readWorkbook } from "@/lib/data-mapper/excel-import";
import type { PersistedWorkbookReview } from "@/lib/data-mapper/persisted-workbook-review";
import { validateWorkbook } from "@/lib/data-mapper/validation";
import { uploadSourceWorkbookDirectly } from "@/lib/data-mapper/source-workbook-direct-upload";
import { SourceWorkbookPolicyError, validateSourceWorkbookDescriptor } from "@/lib/data-mapper/source-workbook-policy";
import {
  CompactWorkbookSummary,
  SelectedWorksheetSummary,
  countWorksheetIssues,
  worksheetRowValidationDescription,
  worksheetRowValidationStates
} from "@/components/data-mapper/workbook-explorer-ui";
import { ValidationNextSteps } from "@/components/data-mapper/validation-next-steps";
import { useHorizontalPan } from "@/components/data-mapper/use-horizontal-pan";
import {
  groupValidationIssuesByRow,
  issueMatchesPreviewFilters,
  rowSeverityLabel,
  sourceCellValidationState,
  updateVisibleRowSelection,
  validationActionScope,
  validationRowsForFilters,
  validationIssuesForWorksheet,
  visibleRowSelectionState,
  type PreviewValidationFilters
} from "@/lib/data-mapper/validation-preview";
import {
  sourceRowKey,
  sourceRowReferenceFromWorksheet,
  type SourceRowReference
} from "@/lib/data-mapper/source-row-exclusions";

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

type WorkbookImporterProps = {
  canPrepareOutputProfiles: boolean;
  canEditReview: boolean;
  projectId: string;
  projectName: string;
  replaceSourceWorkbookImportId?: string;
  persistedReview?: PersistedWorkbookReview;
  buildOutputUrl?: string | null;
};

export function WorkbookImporter({
  canPrepareOutputProfiles,
  canEditReview,
  projectId,
  projectName,
  replaceSourceWorkbookImportId,
  persistedReview,
  buildOutputUrl
}: WorkbookImporterProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [summary, setSummary] = useState<WorkbookSummary | null>(() => persistedReview?.summary ?? null);
  const [validation, setValidation] = useState<WorkbookValidationResult | null>(() => persistedReview?.validation ?? null);
  const [validationFilters, setValidationFilters] = useState<ValidationFilters>({ worksheet: "All worksheets", severity: "All", category: "All" });
  const [ignoredFingerprints, setIgnoredFingerprints] = useState<Set<string>>(() => new Set(persistedReview?.ignoredFingerprints ?? []));
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [excludedRows, setExcludedRows] = useState<Map<string, SourceRowReference>>(() => new Map((persistedReview?.excludedRows ?? []).map((row) => [sourceRowKey(row.worksheetName, row.physicalRowNumber), row])));
  const [deletedRowsReviewOpen, setDeletedRowsReviewOpen] = useState(false);
  const [pendingDeleteRows, setPendingDeleteRows] = useState<SourceRowReference[]>([]);
  const [uploadDetails, setUploadDetails] = useState<UploadedWorkbookDetails | null>(() => persistedReview ? {
    fileName: persistedReview.fileName,
    fileSize: persistedReview.fileSizeBytes,
    uploadedAt: persistedReview.preparedAt
  } : null);
  const [selectedUploadDetails, setSelectedUploadDetails] = useState<UploadedWorkbookDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparingProfile, setIsPreparingProfile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [reviewActionStatus, setReviewActionStatus] = useState<string | null>(null);
  const [isReviewUpdating, startReviewUpdate] = useTransition();
  const worksheetPreviewPan = useHorizontalPan<HTMLDivElement>();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectedWorksheetName = validationFilters.worksheet === "All worksheets" ? null : validationFilters.worksheet ?? null;
  const selectedWorksheet = summary?.worksheets.find((worksheet) => worksheet.name === selectedWorksheetName) ?? null;
  const referenceWorksheet = selectedWorksheet ?? summary?.worksheets[0] ?? null;
  const preview = useMemo(() => {
    if (persistedReview && selectedWorksheet) {
      return persistedReview.worksheetPreviews.find((item) => item.worksheetName === selectedWorksheet.name) ?? null;
    }
    if (!workbook || !selectedWorksheet) return null;
    const worksheet = workbook.getWorksheet(selectedWorksheet.name);
    if (!worksheet) return null;
    return createWorksheetPreview(selectedWorksheet.name, worksheet, selectedWorksheet);
  }, [persistedReview, selectedWorksheet, workbook]);
  const excludedRowKeys = useMemo(() => new Set(excludedRows.keys()), [excludedRows]);
  const activeIssues = useMemo(() => (validation?.issues ?? []).filter((issue) => !excludedRowKeys.has(sourceRowKey(issue.worksheetName, issue.rowNumber))), [excludedRowKeys, validation]);
  const worksheetIssues = useMemo(() => validationIssuesForWorksheet(activeIssues, selectedWorksheetName ?? "", ignoredFingerprints), [activeIssues, ignoredFingerprints, selectedWorksheetName]);
  const matchingWorksheetIssues = useMemo(() => worksheetIssues.filter((issue) => issueMatchesPreviewFilters(issue, validationFilters)), [validationFilters, worksheetIssues]);
  const issuesByRow = useMemo(() => groupValidationIssuesByRow(matchingWorksheetIssues), [matchingWorksheetIssues]);
  const validationFilterActive = validationFilters.severity !== "All" || validationFilters.category !== "All";
  const rows = useMemo(() => visibleRows(preview, searchTerm, sort).filter((row) => !validationFilterActive || issuesByRow.has(row.physicalRowNumber)), [issuesByRow, preview, searchTerm, sort, validationFilterActive]);
  const workbookWideRows = useMemo(() => validationRowsForFilters(validation?.issues ?? [], ignoredFingerprints, excludedRowKeys, validationFilters, searchTerm), [excludedRowKeys, ignoredFingerprints, searchTerm, validation, validationFilters]);
  const unresolvedIssues = useMemo(() => activeIssues.filter((issue) => issue.severity !== "Error" || !ignoredFingerprints.has(issue.fingerprint)), [activeIssues, ignoredFingerprints]);
  const issueCountsByWorksheet = useMemo(() => countWorksheetIssues(unresolvedIssues), [unresolvedIssues]);
  const rowValidationStates = useMemo(() => worksheetRowValidationStates(worksheetIssues, selectedWorksheetName ?? ""), [selectedWorksheetName, worksheetIssues]);
  const visibleValidationRows = useMemo(() => selectedWorksheetName === null
    ? workbookWideRows
    : rows.flatMap((row) => {
      const issues = issuesByRow.get(row.physicalRowNumber) ?? [];
      return issues.length === 0 ? [] : [{
        key: sourceRowKey(selectedWorksheetName, row.physicalRowNumber),
        worksheetName: selectedWorksheetName,
        rowNumber: row.physicalRowNumber,
        issues
      }];
    }), [issuesByRow, rows, selectedWorksheetName, workbookWideRows]);
  const visibleEligibleRowKeys = useMemo(() => visibleValidationRows.map((row) => row.key), [visibleValidationRows]);
  const selectionState = useMemo(() => visibleRowSelectionState(selectedRowKeys, visibleEligibleRowKeys), [selectedRowKeys, visibleEligibleRowKeys]);
  const actionScope = useMemo(() => validationActionScope(visibleValidationRows, selectedRowKeys), [selectedRowKeys, visibleValidationRows]);
  const activeErrorCount = unresolvedIssues.filter((issue) => issue.severity === "Error").length;
  const activeWarningCount = activeIssues.filter((issue) => issue.severity === "Warning").length;
  const ignoredErrorCount = activeIssues.filter((issue) => issue.severity === "Error" && ignoredFingerprints.has(issue.fingerprint)).length;
  const activeWorksheetsWithIssues = new Set(activeIssues.map((issue) => issue.worksheetName)).size;
  const activeCategoryCounts = useMemo(() => ({
    duplicateSku: activeIssues.filter((issue) => issue.category === "duplicate-sku").length,
    missingRequiredField: activeIssues.filter((issue) => issue.category === "missing-required-field").length,
    priceIssue: activeIssues.filter((issue) => issue.category === "price").length,
    marginIssue: activeIssues.filter((issue) => issue.category === "margin").length
  }), [activeIssues]);
  const canChangeReview = persistedReview ? canEditReview : canPrepareOutputProfiles;

  const rowReferences = useMemo(() => {
    const references = new Map<string, SourceRowReference>();
    if (persistedReview) {
      persistedReview.rowReferences.forEach((reference) => references.set(sourceRowKey(reference.worksheetName, reference.physicalRowNumber), reference));
      return references;
    }
    if (!workbook || !summary || !validation) return references;
    for (const issue of validation.issues) {
      const key = sourceRowKey(issue.worksheetName, issue.rowNumber);
      if (references.has(key)) continue;
      const worksheetSummary = summary.worksheets.find((worksheet) => worksheet.name === issue.worksheetName);
      const worksheet = workbook.getWorksheet(issue.worksheetName);
      if (!worksheetSummary || !worksheet) continue;
      const reference = sourceRowReferenceFromWorksheet(worksheet, issue.worksheetName, issue.rowNumber, worksheetSummary.columnCount);
      if (reference) references.set(key, reference);
    }
    return references;
  }, [persistedReview, summary, validation, workbook]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectionState.indeterminate;
  }, [selectionState.indeterminate]);

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
      setValidationFilters({ worksheet: "All worksheets", severity: "All", category: "All" });
      setIgnoredFingerprints(new Set());
      setSelectedRowKeys(new Set());
      setExcludedRows(new Map());
      setDeletedRowsReviewOpen(false);
      setPendingDeleteRows([]);
      setUploadDetails(currentUploadDetails);
    } catch (importError) {
      setWorkbook(null);
      setSummary(null);
      setValidation(null);
      setSelectedFile(null);
      setUploadDetails(null);
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
    setValidationFilters((current) => ({ ...current, worksheet: worksheetName }));
    setSearchTerm("");
    setSort(null);
    setSelectedRowKeys(new Set());
  }

  function updateValidationFilter<Key extends "severity" | "category">(key: Key, value: ValidationFilters[Key]) {
    setValidationFilters((current) => ({ ...current, [key]: value }));
    setSelectedRowKeys(new Set());
  }

  function updateValidationSearch(value: string) {
    setSearchTerm(value);
    setSelectedRowKeys(new Set());
  }

  function deleteSelectedRows() {
    const references = [...selectedRowKeys].flatMap((key) => rowReferences.get(key) ?? []);
    if (references.length === 0) return;
    setPendingDeleteRows(references);
  }

  function confirmDeleteRows() {
    const rows = pendingDeleteRows;
    if (rows.length === 0 || isReviewUpdating) return;
    const applyChange = () => {
      setExcludedRows((current) => {
        const next = new Map(current);
        rows.forEach((reference) => next.set(sourceRowKey(reference.worksheetName, reference.physicalRowNumber), reference));
        return next;
      });
      setSelectedRowKeys(new Set());
      setPendingDeleteRows([]);
    };
    if (!persistedReview) return applyChange();
    setReviewActionError(null);
    startReviewUpdate(async () => {
      const result = await updateSourceRowExclusionsAction({ sourceWorkbookImportId: persistedReview.sourceWorkbookImportId, rows, action: "EXCLUDE" });
      if (!result.ok) {
        setReviewActionError(result.error);
        return;
      }
      applyChange();
      router.refresh();
    });
  }

  function setRowSelected(key: string, checked: boolean) {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
  }

  function changeIgnoredErrors(fingerprints: string[], action: "IGNORE" | "RESTORE", scope: "selected" | "visible") {
    if (fingerprints.length === 0 || isReviewUpdating) return;
    const changed = new Set(fingerprints);
    const applyChange = () => {
      setIgnoredFingerprints((current) => action === "IGNORE"
        ? new Set([...current, ...fingerprints])
        : new Set([...current].filter((fingerprint) => !changed.has(fingerprint))));
      setSelectedRowKeys(new Set());
      const qualifier = scope === "selected" ? "selected" : action === "IGNORE" ? "visible blocking" : "visible ignored";
      setReviewActionStatus(`${fingerprints.length} ${qualifier} ${fingerprints.length === 1 ? "error" : "errors"} ${action === "IGNORE" ? "ignored" : "restored"}.`);
    };
    setReviewActionStatus(null);
    setReviewActionError(null);
    if (!persistedReview) return applyChange();
    startReviewUpdate(async () => {
      const result = await updateValidationIssueOverridesAction({ sourceWorkbookImportId: persistedReview.sourceWorkbookImportId, fingerprints, action });
      if (!result.ok) {
        setReviewActionError(result.error);
        return;
      }
      applyChange();
      router.refresh();
    });
  }

  function ignoreSelectedErrors() {
    changeIgnoredErrors(actionScope.selectedUnresolvedErrorFingerprints, "IGNORE", "selected");
  }

  function restoreSelectedErrors() {
    changeIgnoredErrors(actionScope.selectedIgnoredErrorFingerprints, "RESTORE", "selected");
  }

  function restoreDeletedRows(keys: readonly string[]) {
    const rows = keys.flatMap((key) => excludedRows.get(key) ?? []);
    if (rows.length === 0 || isReviewUpdating) return;
    const applyChange = () => {
      setExcludedRows((current) => {
        const next = new Map(current);
        keys.forEach((key) => next.delete(key));
        return next;
      });
    };
    if (!persistedReview) return applyChange();
    setReviewActionError(null);
    startReviewUpdate(async () => {
      const result = await updateSourceRowExclusionsAction({ sourceWorkbookImportId: persistedReview.sourceWorkbookImportId, rows, action: "RESTORE" });
      if (!result.ok) {
        setReviewActionError(result.error);
        return;
      }
      applyChange();
      router.refresh();
    });
  }

  async function prepareOutputProfile() {
    if (!selectedFile || !canPrepareOutputProfiles || isPreparingProfile) return;
    setIsPreparingProfile(true);
    setUploadProgress(0);
    setProfileError(null);
    try {
      const result = await uploadSourceWorkbookDirectly(selectedFile, {
        projectId,
        worksheetName: referenceWorksheet?.name,
        replaceSourceWorkbookImportId,
        ignoredValidationFingerprints: [...ignoredFingerprints],
        excludedRows: [...excludedRows.values()],
        onProgress: setUploadProgress
      });
      router.push(replaceSourceWorkbookImportId
        ? `/projects/${encodeURIComponent(projectId)}/workbook?source=${encodeURIComponent(result.sourceWorkbookImportId)}`
        : result.mappingUrl);
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
            <p className="breadcrumb"><Link href="/projects">Projects</Link> › <Link href={`/projects/${projectId}`}>{projectName}</Link> › {persistedReview ? "Review workbook" : "Workbook"}</p>
            <h1>{replaceSourceWorkbookImportId ? "Replace workbook" : persistedReview ? "Review workbook" : "Workbook Explorer"}</h1>
            <p>{persistedReview
              ? "Continue reviewing the stored workbook and its saved validation decisions."
              : "Import Excel workbooks, inspect worksheet structure and preview the first 100 data rows before mapping or validation."}</p>
          </div>
          <div className="actions"><Link className="secondary" href={`/projects/${projectId}`}>Project</Link>{summary ? <span className="badge success">{persistedReview ? "Stored workbook loaded" : "Workbook loaded"}</span> : <span className="badge">Ready for upload</span>}</div>
        </div>
      </section>

      {profileError ? <div className="warningBox">{profileError}</div> : null}
      {reviewActionError ? <div className="warningBox" role="alert">{reviewActionError}</div> : null}

      {!persistedReview ? <section className="card">
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
      </section> : null}

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
                <span className={activeErrorCount > 0 ? "badge danger" : activeWarningCount > 0 ? "badge warning" : "badge success"}>
                  {activeErrorCount > 0 ? "Errors found" : activeWarningCount > 0 ? "Warnings found" : "No active issues"}
                </span>
              </div>
              <div className="summaryGrid">
                <div><strong>{validation.summary.totalRowsChecked.toLocaleString("en-GB")}</strong><span>Total rows checked</span></div>
                <div><strong>{activeErrorCount.toLocaleString("en-GB")}</strong><span>Active errors</span></div>
                <div><strong>{activeWarningCount.toLocaleString("en-GB")}</strong><span>Active warnings</span></div>
                <div><strong>{activeWorksheetsWithIssues.toLocaleString("en-GB")}</strong><span>Worksheets with issues</span></div>
                <div><strong>{activeCategoryCounts.duplicateSku.toLocaleString("en-GB")}</strong><span>Duplicate SKUs</span></div>
                <div><strong>{activeCategoryCounts.missingRequiredField.toLocaleString("en-GB")}</strong><span>Missing required fields</span></div>
                <div><strong>{activeCategoryCounts.priceIssue.toLocaleString("en-GB")}</strong><span>Price issues</span></div>
                <div><strong>{activeCategoryCounts.marginIssue.toLocaleString("en-GB")}</strong><span>Margin issues</span></div>
              </div>
              {activeErrorCount > 0 ? (
                <p className="validationErrorGuidance" role="alert">Errors were found in the processed workbook data. Correct, ignore, or delete the affected rows before generating output.</p>
              ) : null}
              {activeWarningCount > 0 ? (
                <p className="validationWarningGuidance">Warnings identify values to review but do not block Output Profile design.</p>
              ) : null}
              {ignoredErrorCount > 0 ? <p className="muted"><strong>{ignoredErrorCount.toLocaleString("en-GB")} ignored {ignoredErrorCount === 1 ? "error" : "errors"}</strong> · Ignored errors remain visible but do not block output.</p> : null}
              {excludedRows.size > 0 ? <p className="muted"><strong>{excludedRows.size} deleted {excludedRows.size === 1 ? "row" : "rows"}</strong> · <button className="linkButton" type="button" onClick={() => setDeletedRowsReviewOpen(true)}>View / restore deleted rows</button></p> : null}
            </section>
          ) : null}

          <section className="card workbookPreviewCard">
            <div className="sectionHeader workbookPreviewHeader">
              <div>
                <h2>Validation preview</h2>
                <p className="muted">Review issue rows across the workbook, or choose one worksheet for the integrated source preview.</p>
              </div>
              <div className="workbookPreviewControls">
                <label className="searchBox"><Search aria-hidden="true" size={18} /><span className="visuallyHidden">Search worksheet preview</span><input value={searchTerm} onChange={(event) => updateValidationSearch(event.target.value)} placeholder="Search preview" /></label>
                <div className="validationFilters">
                  <label className="field"><span>Worksheet</span><select value={validationFilters.worksheet} onChange={(event) => selectWorksheet(event.target.value)}><option>All worksheets</option>{summary.worksheets.map((worksheet) => <option key={worksheet.name} value={worksheet.name}>{worksheet.name}</option>)}</select></label>
                  <label className="field"><span>Severity</span><select value={validationFilters.severity} onChange={(event) => updateValidationFilter("severity", event.target.value as ValidationFilters["severity"])}><option>All</option><option>Error</option><option>Warning</option></select></label>
                  <label className="field"><span>Issue type</span><select value={validationFilters.category} onChange={(event) => updateValidationFilter("category", event.target.value as ValidationFilters["category"])}><option>All</option>{Object.entries(validationCategoryLabels).map(([category, label]) => <option key={category} value={category}>{label}</option>)}</select></label>
                </div>
              </div>
            </div>

            <div className="worksheetRowLegend" aria-label="Worksheet validation row legend">
              <span className="worksheetRowLegendItem rowError"><span aria-hidden="true" />Error</span>
              <span className="worksheetRowLegendItem rowWarning"><span aria-hidden="true" />Warning</span>
              <span className="worksheetRowLegendItem rowIgnoredError"><span aria-hidden="true" />Ignored error</span>
            </div>
            {reviewActionStatus ? <div className="successBox" role="status" aria-live="polite">{reviewActionStatus}</div> : null}
            {canChangeReview && selectionState.selectedVisibleCount > 0 ? <div className="actions validationPreviewActions" aria-label="Selected validation row actions">
              <strong>{selectionState.selectedVisibleCount} {selectionState.selectedVisibleCount === 1 ? "row" : "rows"} selected</strong>
              <button className="dangerButton" type="button" disabled={isReviewUpdating} onClick={deleteSelectedRows}>Delete selected rows</button>
              <button className="secondary" type="button" disabled={isReviewUpdating || actionScope.selectedUnresolvedErrorFingerprints.length === 0} onClick={ignoreSelectedErrors}>Ignore selected errors</button>
              <button className="secondary" type="button" disabled={isReviewUpdating || actionScope.selectedIgnoredErrorFingerprints.length === 0} onClick={restoreSelectedErrors}>Restore selected errors</button>
            </div> : null}
            {canChangeReview && validation && activeIssues.some((issue) => issue.severity === "Error") ? <div className="actions validationPreviewActions">
              <button className="secondary" type="button" disabled={isReviewUpdating || actionScope.visibleUnresolvedErrorFingerprints.length === 0} onClick={() => changeIgnoredErrors(actionScope.visibleUnresolvedErrorFingerprints, "IGNORE", "visible")}>Ignore {actionScope.visibleUnresolvedErrorFingerprints.length || "all"} visible blocking {actionScope.visibleUnresolvedErrorFingerprints.length === 1 ? "error" : "errors"}</button>
              <button className="secondary" type="button" disabled={isReviewUpdating || actionScope.visibleIgnoredErrorFingerprints.length === 0} onClick={() => changeIgnoredErrors(actionScope.visibleIgnoredErrorFingerprints, "RESTORE", "visible")}>Restore {actionScope.visibleIgnoredErrorFingerprints.length || "all"} visible ignored {actionScope.visibleIgnoredErrorFingerprints.length === 1 ? "error" : "errors"}</button>
            </div> : null}

            <div className="worksheetPreviewPanel" tabIndex={0}>
              {selectedWorksheetName === null ? (
                workbookWideRows.length > 0 ? <div className="previewTableWrap validationWorkbookWideTableWrap">
                  <table className="previewTable validationWorkbookWideTable">
                    <thead><tr>
                      <th className="validationSelectionColumn"><input ref={selectAllRef} type="checkbox" checked={selectionState.checked} disabled={!canChangeReview || isReviewUpdating} aria-label={`Select all ${visibleEligibleRowKeys.length} visible validation rows`} onChange={(event) => setSelectedRowKeys((current) => updateVisibleRowSelection(current, visibleEligibleRowKeys, event.target.checked))} /></th>
                      <th>Worksheet</th><th>Row</th><th>Severity</th><th>Current value</th><th>Rule / message</th>
                    </tr></thead>
                    <tbody>{workbookWideRows.map((row) => {
                      const rowState = worksheetRowValidationStates(row.issues, row.worksheetName).get(row.rowNumber) ?? "normal";
                      return <tr className={`worksheetDataRow ${rowState}`} key={row.key}>
                        <td className="validationSelectionColumn"><input type="checkbox" disabled={!canChangeReview || isReviewUpdating} aria-label={`Select ${row.worksheetName} row ${row.rowNumber}`} checked={selectedRowKeys.has(row.key)} onChange={(event) => setRowSelected(row.key, event.target.checked)} /></td>
                        <td>{row.worksheetName}</td><td>{row.rowNumber}</td>
                        <td><span className={rowState === "error" ? "badge danger" : rowState === "warning" ? "badge warning" : "badge"}>{rowSeverityLabel(row.issues)}</span></td>
                        <td><span className="validationIssueStack">{row.issues.slice(0, 3).map((issue) => <span key={issue.fingerprint}>{issue.field}: {issue.currentValue || "Blank"}</span>)}{row.issues.length > 3 ? <small>+ {row.issues.length - 3} more</small> : null}</span></td>
                        <td><span className="validationIssueStack">{row.issues.slice(0, 3).map((issue) => <span key={issue.fingerprint}>{validationCategoryLabels[issue.category]} · {issue.message}</span>)}{row.issues.length > 3 ? <small>+ {row.issues.length - 3} more</small> : null}</span></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div> : <div className="emptyState"><h2>No validation rows match these filters</h2><p className="muted">Adjust Worksheet, Severity, Issue type or search to review other rows.</p></div>
              ) : <>
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
                        <th className="validationSelectionColumn"><input ref={selectAllRef} type="checkbox" checked={selectionState.checked} disabled={!canChangeReview || isReviewUpdating} aria-label={`Select all ${visibleEligibleRowKeys.length} visible validation rows`} onChange={(event) => setSelectedRowKeys((current) => updateVisibleRowSelection(current, visibleEligibleRowKeys, event.target.checked))} /></th>
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
                        const rowKey = sourceRowKey(selectedWorksheetName, row.physicalRowNumber);
                        return (
                        <tr aria-label={`${rowDescription}, worksheet row ${row.physicalRowNumber}`} className={rowState === "normal" ? undefined : `worksheetDataRow ${rowState}`} key={`${selectedWorksheetName}-${row.physicalRowNumber}`}>
                          <td className="validationSelectionColumn">{rowIssues.length > 0 ? <input type="checkbox" disabled={!canChangeReview || isReviewUpdating} aria-label={`Select ${selectedWorksheetName} row ${row.physicalRowNumber}`} checked={selectedRowKeys.has(rowKey)} onChange={(event) => setRowSelected(rowKey, event.target.checked)} /> : null}</td>
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
              </>}
            </div>
          </section>

          {deletedRowsReviewOpen ? <div className="validationReviewBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletedRowsReviewOpen(false); }}><section className="validationReviewDialog" role="dialog" aria-modal="true" aria-labelledby="deleted-rows-title"><div className="sectionHeader"><div><h2 id="deleted-rows-title">Deleted rows</h2><p className="muted">These rows are excluded from processed data and generated outputs. The uploaded Excel file is unchanged.</p></div><button className="secondary" type="button" onClick={() => setDeletedRowsReviewOpen(false)}>Close</button></div>{canChangeReview ? <div className="actions"><button className="secondary" type="button" disabled={excludedRows.size === 0 || isReviewUpdating} onClick={() => restoreDeletedRows([...excludedRows.keys()])}>Restore all deleted rows</button></div> : null}<div className="previewTableWrap"><table className="previewTable"><thead><tr><th>Worksheet</th><th>Row</th><th>Original severity</th><th>Current value</th><th>Validation reason</th>{canChangeReview ? <th>Action</th> : null}</tr></thead><tbody>{[...excludedRows.entries()].map(([key, row]) => { const rowIssues = (validation?.issues ?? []).filter((issue) => issue.worksheetName === row.worksheetName && issue.rowNumber === row.physicalRowNumber); return <tr key={key}><td>{row.worksheetName}</td><td>{row.physicalRowNumber}</td><td>{rowSeverityLabel(rowIssues.map((issue) => ({ ...issue, ignored: ignoredFingerprints.has(issue.fingerprint) })))}</td><td>{rowIssues.slice(0, 3).map((issue) => issue.currentValue || "Blank").join(" · ")}</td><td>{rowIssues.slice(0, 3).map((issue) => issue.message).join(" · ")}{rowIssues.length > 3 ? ` · + ${rowIssues.length - 3} more` : ""}</td>{canChangeReview ? <td><button className="secondary" type="button" disabled={isReviewUpdating} onClick={() => restoreDeletedRows([key])}>Restore</button></td> : null}</tr>; })}</tbody></table></div></section></div> : null}
          {pendingDeleteRows.length > 0 ? <div className="validationReviewBackdrop" role="presentation"><section className="validationReviewDialog compactConfirmation" role="dialog" aria-modal="true" aria-labelledby="delete-selected-rows-title"><h2 id="delete-selected-rows-title">Delete selected rows</h2><p>Delete {pendingDeleteRows.length} selected {pendingDeleteRows.length === 1 ? "row" : "rows"} from this workbook&apos;s processed data? They will be excluded from generated outputs. The original uploaded Excel file will not be changed.</p><div className="actions"><button className="secondary" type="button" disabled={isReviewUpdating} onClick={() => setPendingDeleteRows([])}>Cancel</button><button className="dangerButton" type="button" disabled={isReviewUpdating} onClick={confirmDeleteRows}>{isReviewUpdating ? "Deleting" : "Delete rows"}</button></div></section></div> : null}

          {validation && selectedFile ? (
            <ValidationNextSteps
              errorCount={activeErrorCount}
              warningCount={activeWarningCount}
              canContinue={canPrepareOutputProfiles}
              isPreparing={isPreparingProfile}
              uploadProgress={uploadProgress}
              onUploadCorrected={() => inputRef.current?.click()}
              onContinue={prepareOutputProfile}
            />
          ) : null}
          {validation && persistedReview ? <section className="card validationNextSteps" aria-labelledby="persisted-review-next-step-title">
            <div>
              <p className="sheetLabel">Next step</p>
              <h2 id="persisted-review-next-step-title">Continue to Build Output</h2>
              <p className="muted">{activeErrorCount > 0
                ? `${activeErrorCount.toLocaleString("en-GB")} unresolved blocking ${activeErrorCount === 1 ? "error remains" : "errors remain"}. Ignore, delete or correct those rows before generation.`
                : "The saved validation decisions are ready to use when building output."}</p>
            </div>
            <div className="actions validationNextStepActions">
              <Link className="secondary prominentSecondary" href={`/projects/${projectId}/workbook?replace=${encodeURIComponent(persistedReview.sourceWorkbookImportId)}`}>Replace workbook</Link>
              {buildOutputUrl ? <Link className="primary" href={buildOutputUrl}>Build output</Link> : null}
            </div>
          </section> : null}
        </>
      ) : null}
    </>
  );
}
