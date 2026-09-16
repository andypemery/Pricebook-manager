import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobSdk = vi.hoisted(() => ({
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
  head: vi.fn(),
  get: vi.fn(),
  del: vi.fn()
}));

vi.mock("@vercel/blob", () => ({
  ...blobSdk,
  BlobNotFoundError: class BlobNotFoundError extends Error {}
}));

import { getSourceWorkbookStorage, sourceWorkbookStorageAvailable } from "../lib/data-mapper/source-workbook-storage";

describe("Vercel private Blob source storage", () => {
  beforeEach(() => {
    process.env.VERCEL_OIDC_TOKEN = "test-oidc-token-not-logged";
    process.env.BLOB_STORE_ID = "store_test";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    blobSdk.issueSignedToken.mockResolvedValue({ delegationToken: "delegation", clientSigningToken: "signing", validUntil: 2_000 });
    blobSdk.presignUrl.mockResolvedValue({ presignedUrl: "https://vercel.com/api/blob?signed" });
    blobSdk.head.mockResolvedValue({
      pathname: "source-workbooks/tenant-a/source-a/original.xlsx",
      url: "https://store.private.blob.vercel-storage.com/source-workbooks/tenant-a/source-a/original.xlsx",
      size: 123,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      etag: "etag-1"
    });
    blobSdk.get.mockImplementation(async () => ({ stream: new Response(new Uint8Array([1, 2, 3])).body }));
  });

  afterEach(() => {
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_STORE_ID;
    vi.clearAllMocks();
  });

  it("uses OIDC-compatible signed PUT material scoped to one private path, operation, MIME and 20 MB limit", async () => {
    expect(sourceWorkbookStorageAvailable()).toBe(true);
    const storage = getSourceWorkbookStorage();
    const input = {
      storageKey: "source-workbooks/tenant-a/source-a/original.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      maximumSizeInBytes: 20 * 1024 * 1024,
      validUntil: 2_000
    };

    await expect(storage.authoriseUpload(input)).resolves.toEqual({ uploadUrl: "https://vercel.com/api/blob?signed" });
    expect(blobSdk.issueSignedToken).toHaveBeenCalledWith({ pathname: input.storageKey, operations: ["put"], allowedContentTypes: [input.contentType], maximumSizeInBytes: input.maximumSizeInBytes, validUntil: input.validUntil });
    expect(blobSdk.presignUrl).toHaveBeenCalledWith(expect.objectContaining({ delegationToken: "delegation" }), expect.objectContaining({ access: "private", operation: "put", pathname: input.storageKey, allowOverwrite: false, addRandomSuffix: false }));
    expect(blobSdk.issueSignedToken.mock.calls[0]?.[0].operations).not.toContain("get");
    expect(blobSdk.issueSignedToken.mock.calls[0]?.[0].operations).not.toContain("delete");
  });

  it("verifies private metadata and supports an explicit CDN bypass for immediate finalisation reads", async () => {
    const storage = getSourceWorkbookStorage();
    await expect(storage.head("source-workbooks/tenant-a/source-a/original.xlsx")).resolves.toMatchObject({ access: "private", size: 123 });
    await expect(storage.get("source-workbooks/tenant-a/source-a/original.xlsx", { useCache: false })).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(blobSdk.get).toHaveBeenCalledWith("source-workbooks/tenant-a/source-a/original.xlsx", { access: "private", useCache: false });
    await storage.get("source-workbooks/tenant-a/source-a/original.xlsx");
    expect(blobSdk.get).toHaveBeenLastCalledWith("source-workbooks/tenant-a/source-a/original.xlsx", { access: "private", useCache: true });
  });
});
