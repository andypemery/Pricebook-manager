import { del, get, put } from "@vercel/blob";

export type StoredSourceWorkbook = {
  storageKey: string;
  url: string;
};

export interface SourceWorkbookStorage {
  put(input: { storageKey: string; bytes: Uint8Array; contentType: string }): Promise<StoredSourceWorkbook>;
  get(storageKey: string): Promise<Uint8Array | null>;
  delete(storageKey: string): Promise<void>;
}

function configured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

class VercelBlobSourceWorkbookStorage implements SourceWorkbookStorage {
  async put(input: { storageKey: string; bytes: Uint8Array; contentType: string }) {
    const blob = await put(input.storageKey, input.bytes, { access: "private", contentType: input.contentType, addRandomSuffix: false });
    return { storageKey: input.storageKey, url: blob.url };
  }

  async get(storageKey: string) {
    const response = await get(storageKey, { access: "private" }) as unknown as { stream?: ReadableStream<Uint8Array> | null } | null;
    if (!response?.stream) return null;
    return new Uint8Array(await new Response(response.stream).arrayBuffer());
  }

  async delete(storageKey: string) {
    await del(storageKey);
  }
}

export function sourceWorkbookStorageAvailable() {
  return configured();
}

export function getSourceWorkbookStorage(): SourceWorkbookStorage {
  if (!configured()) {
    throw new Error("Private source-workbook storage is not configured. Set BLOB_READ_WRITE_TOKEN for this environment before uploading a source workbook.");
  }
  return new VercelBlobSourceWorkbookStorage();
}

export function sourceWorkbookStorageKey(tenantId: string, sourceWorkbookImportId: string, extension: "xlsx" | "xlsm") {
  return `source-workbooks/${tenantId}/${sourceWorkbookImportId}/original.${extension}`;
}

export function sourceWorkbookExtension(fileName: string): "xlsx" | "xlsm" | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension === "xlsx" || extension === "xlsm" ? extension : null;
}

export function createInMemorySourceWorkbookStorage(): SourceWorkbookStorage {
  const files = new Map<string, Uint8Array>();
  return {
    async put({ storageKey, bytes }) { files.set(storageKey, bytes.slice()); return { storageKey, url: `memory://${storageKey}` }; },
    async get(storageKey) { return files.get(storageKey)?.slice() ?? null; },
    async delete(storageKey) { files.delete(storageKey); }
  };
}
