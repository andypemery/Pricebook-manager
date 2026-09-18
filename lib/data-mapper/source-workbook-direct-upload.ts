import { validateSourceWorkbookDescriptor } from "@/lib/data-mapper/source-workbook-policy";
import type { SourceRowReference } from "@/lib/data-mapper/source-row-exclusions";

type UploadAuthorisationResponse = {
  uploadIntent?: string;
  uploadUrl?: string;
  contentType?: string;
  expiresAt?: number;
  error?: string;
};

export type SourceWorkbookRegistrationResponse = {
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  projectId: string;
  mappingUrl: string;
};

type DirectPut = (input: {
  uploadUrl: string;
  file: File;
  contentType: string;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
}) => Promise<void>;

export function putSourceWorkbookDirectly({ uploadUrl, file, contentType, onProgress, signal }: Parameters<DirectPut>[0]) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)));
    });
    xhr.addEventListener("load", () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error("The upload authorisation expired. Please try again."));
      } else {
        reject(new Error("The workbook could not be uploaded to private storage. Please try again."));
      }
    });
    xhr.addEventListener("error", () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("The workbook upload was interrupted by a network error. Please try again."));
    });
    xhr.addEventListener("abort", () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("The workbook upload was cancelled."));
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    xhr.send(file);
  });
}

export async function uploadSourceWorkbookDirectly(
  file: File,
  options: {
    projectId: string;
    worksheetName?: string | null;
    ignoredValidationFingerprints?: string[];
    excludedRows?: SourceRowReference[];
    replaceSourceWorkbookImportId?: string;
    onProgress?: (percentage: number) => void;
    signal?: AbortSignal;
    directPut?: DirectPut;
    request?: typeof fetch;
  }
): Promise<SourceWorkbookRegistrationResponse> {
  const descriptor = validateSourceWorkbookDescriptor({ fileName: file.name, fileSizeBytes: file.size, contentType: file.type });
  const request = options.request ?? fetch;
  const authorisationResponse = await request("/api/data-mapper/source-imports/upload-authorisation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: descriptor.originalFileName,
      fileSizeBytes: descriptor.fileSizeBytes,
      contentType: file.type,
      projectId: options.projectId,
      replaceSourceWorkbookImportId: options.replaceSourceWorkbookImportId
    }),
    signal: options.signal
  });
  const authorisation = await authorisationResponse.json() as UploadAuthorisationResponse;
  if (!authorisationResponse.ok || !authorisation.uploadIntent || !authorisation.uploadUrl || !authorisation.contentType) {
    throw new Error(authorisation.error || "A secure workbook upload could not be authorised.");
  }

  let directUploadError: Error | null = null;
  try {
    await (options.directPut ?? putSourceWorkbookDirectly)({
      uploadUrl: authorisation.uploadUrl,
      file,
      contentType: authorisation.contentType,
      onProgress: options.onProgress,
      signal: options.signal
    });
  } catch (error) {
    directUploadError = error instanceof Error ? error : new Error("The workbook could not be uploaded to private storage.");
  }

  const registrationResponse = await request("/api/data-mapper/source-imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadIntent: authorisation.uploadIntent,
      worksheetName: options.worksheetName,
      ignoredValidationFingerprints: options.ignoredValidationFingerprints,
      excludedRows: options.excludedRows
    }),
    signal: options.signal
  });
  const registration = await registrationResponse.json() as Partial<SourceWorkbookRegistrationResponse> & { error?: string };
  if (!registrationResponse.ok || !registration.mappingUrl || !registration.sourceWorkbookImportId || !registration.sourceWorksheetId || registration.projectId !== options.projectId) {
    if (directUploadError) throw directUploadError;
    throw new Error(registration.error || "The uploaded workbook could not be registered.");
  }
  return registration as SourceWorkbookRegistrationResponse;
}
