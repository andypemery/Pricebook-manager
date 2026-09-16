import { BlobNotFoundError, del, get, head, issueSignedToken, presignUrl } from "@vercel/blob";

export type StoredSourceWorkbookMetadata = {
  storageKey: string;
  url: string;
  size: number;
  contentType: string;
  etag: string;
  access: "private" | "public";
};

export interface SourceWorkbookStorage {
  authoriseUpload(input: { storageKey: string; contentType: string; maximumSizeInBytes: number; validUntil: number }): Promise<{ uploadUrl: string }>;
  head(storageKey: string): Promise<StoredSourceWorkbookMetadata | null>;
  get(storageKey: string, options?: { useCache?: boolean }): Promise<Uint8Array | null>;
  delete(storageKey: string): Promise<void>;
}

function configured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
}

class VercelBlobSourceWorkbookStorage implements SourceWorkbookStorage {
  async authoriseUpload(input: { storageKey: string; contentType: string; maximumSizeInBytes: number; validUntil: number }) {
    const token = await issueSignedToken({
      pathname: input.storageKey,
      operations: ["put"],
      allowedContentTypes: [input.contentType],
      maximumSizeInBytes: input.maximumSizeInBytes,
      validUntil: input.validUntil
    });
    const { presignedUrl } = await presignUrl(token, {
      access: "private",
      operation: "put",
      pathname: input.storageKey,
      allowedContentTypes: [input.contentType],
      maximumSizeInBytes: input.maximumSizeInBytes,
      validUntil: input.validUntil,
      addRandomSuffix: false,
      allowOverwrite: false
    });
    return { uploadUrl: presignedUrl };
  }

  async head(storageKey: string) {
    try {
      const blob = await head(storageKey);
      const hostname = new URL(blob.url).hostname;
      return {
        storageKey: blob.pathname,
        url: blob.url,
        size: blob.size,
        contentType: blob.contentType,
        etag: blob.etag,
        access: hostname.endsWith(".private.blob.vercel-storage.com") ? "private" as const : "public" as const
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async get(storageKey: string, options?: { useCache?: boolean }) {
    const response = await get(storageKey, { access: "private", useCache: options?.useCache ?? true }) as unknown as { stream?: ReadableStream<Uint8Array> | null } | null;
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
    throw new Error("Private source-workbook storage is not configured. Connect a private Blob store to this project with OIDC, or configure the legacy BLOB_READ_WRITE_TOKEN fallback.");
  }
  return new VercelBlobSourceWorkbookStorage();
}

export function sourceWorkbookStorageKey(tenantId: string, sourceWorkbookImportId: string, extension: "xlsx" | "xlsm") {
  return `source-workbooks/${tenantId}/${sourceWorkbookImportId}/original.${extension}`;
}

export type InMemorySourceWorkbookStorage = SourceWorkbookStorage & {
  uploadDirect(input: { uploadUrl: string; bytes: Uint8Array; contentType: string; now?: number }): Promise<void>;
};

export function createInMemorySourceWorkbookStorage(): InMemorySourceWorkbookStorage {
  const files = new Map<string, { bytes: Uint8Array; contentType: string; url: string; etag: string }>();
  const authorisations = new Map<string, { storageKey: string; contentType: string; maximumSizeInBytes: number; validUntil: number }>();
  return {
    async authoriseUpload(input) {
      const uploadUrl = `memory-upload://${crypto.randomUUID()}`;
      authorisations.set(uploadUrl, { ...input });
      return { uploadUrl };
    },
    async uploadDirect({ uploadUrl, bytes, contentType, now = Date.now() }) {
      const authorisation = authorisations.get(uploadUrl);
      if (!authorisation || authorisation.validUntil <= now) throw new Error("Upload authorisation has expired or is invalid.");
      if (contentType !== authorisation.contentType) throw new Error("Upload content type is not authorised.");
      if (bytes.byteLength > authorisation.maximumSizeInBytes) throw new Error("Upload exceeds its authorised size.");
      if (files.has(authorisation.storageKey)) throw new Error("The authorised object already exists.");
      files.set(authorisation.storageKey, {
        bytes: bytes.slice(),
        contentType,
        url: `memory://${authorisation.storageKey}`,
        etag: `memory-${bytes.byteLength}`
      });
    },
    async head(storageKey) {
      const stored = files.get(storageKey);
      return stored ? { storageKey, url: stored.url, size: stored.bytes.byteLength, contentType: stored.contentType, etag: stored.etag, access: "private" } : null;
    },
    async get(storageKey) { return files.get(storageKey)?.bytes.slice() ?? null; },
    async delete(storageKey) { files.delete(storageKey); }
  };
}

export { sourceWorkbookExtension } from "@/lib/data-mapper/source-workbook-policy";
