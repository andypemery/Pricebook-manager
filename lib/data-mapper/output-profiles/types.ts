export const outputProfilePreviewRowLimit = 3;

export type SourceWorksheetPreview = {
  id: string;
  sourceWorkbookImportId: string;
  workbookFileName: string;
  worksheetName: string;
  headers: string[];
  sampleRows: string[][];
};

export type OutputProfileColumnDraft = {
  clientId: string;
  sourceColumnIndex: number;
  sourceHeading: string;
  outputHeading: string;
};

export type OutputProfileDraft = {
  id: string | null;
  name: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  columns: OutputProfileColumnDraft[];
};

export type SaveOutputProfileInput = {
  id?: string | null;
  name: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  columns: Array<{
    sourceColumnIndex: number;
    sourceHeading: string;
    outputHeading: string;
  }>;
};

export type SaveOutputProfileResult =
  | { ok: true; profileId: string; message: string }
  | { ok: false; error: string };
