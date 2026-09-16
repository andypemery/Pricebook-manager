import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  authoriseSourceWorkbookUpload: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/data-mapper/source-workbook-upload", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/data-mapper/source-workbook-upload")>();
  return { ...original, authoriseSourceWorkbookUpload: mocks.authoriseSourceWorkbookUpload };
});

import { POST } from "../app/api/data-mapper/source-imports/upload-authorisation/route";

function request() {
  return new Request("https://pricebook.example/api/data-mapper/source-imports/upload-authorisation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: "pricebook.xlsx", fileSizeBytes: 1024, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  });
}

describe("source workbook upload authorisation route security", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not issue an upload authorisation when authentication fails", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(POST(request())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.authoriseSourceWorkbookUpload).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user lacks upload/edit permission", async () => {
    mocks.requireUser.mockResolvedValueOnce({ id: "viewer", tenantId: "tenant-1", role: "VIEW_ONLY", permissions: {} });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.authoriseSourceWorkbookUpload).not.toHaveBeenCalled();
  });

  it("passes the authenticated tenant actor to server-side authorisation", async () => {
    const actor = { id: "editor", tenantId: "tenant-1", role: "SUPER_USER", permissions: {} };
    mocks.requireUser.mockResolvedValueOnce(actor);
    mocks.authoriseSourceWorkbookUpload.mockResolvedValueOnce({ uploadIntent: "intent", uploadUrl: "signed-url", contentType: "type", expiresAt: 1 });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.authoriseSourceWorkbookUpload).toHaveBeenCalledWith({}, actor, expect.objectContaining({ fileName: "pricebook.xlsx", fileSizeBytes: 1024 }));
  });
});
