import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { uploadSourceWorkbookDirectly } from "../lib/data-mapper/source-workbook-direct-upload";
import { maximumSourceWorkbookBytes, sourceWorkbookContentTypes } from "../lib/data-mapper/source-workbook-policy";

const projectId = "project-1";

function declaredSizeFile(size: number) {
  const file = new File(["small-test-double"], "pricebook.xlsx", { type: sourceWorkbookContentTypes.xlsx });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function successfulRequest() {
  const request = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("upload-authorisation")) {
      return Response.json({ uploadIntent: "signed-intent", uploadUrl: "https://vercel.com/api/blob?signed", contentType: sourceWorkbookContentTypes.xlsx, expiresAt: Date.now() + 60_000 }, { status: 201 });
    }
    return Response.json({ sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1", projectId, mappingUrl: "/mapping?project=project-1&source=source-1&worksheet=worksheet-1" }, { status: 201 });
  });
  return request;
}

describe("browser-to-private-Blob source uploads", () => {
  it("sends a >4.5 MB workbook only to the signed Blob URL and keeps app requests compact JSON", async () => {
    const file = declaredSizeFile(5 * 1024 * 1024);
    const request = successfulRequest();
    const directPut = vi.fn(async () => undefined);

    await uploadSourceWorkbookDirectly(file, { projectId, request: request as unknown as typeof fetch, directPut });

    expect(directPut).toHaveBeenCalledWith(expect.objectContaining({ uploadUrl: "https://vercel.com/api/blob?signed", file, contentType: sourceWorkbookContentTypes.xlsx }));
    expect(request).toHaveBeenCalledTimes(2);
    for (const [, init] of request.mock.calls) {
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.body).toEqual(expect.any(String));
      expect(init?.body).not.toBe(file);
    }
    const finalisationBody = JSON.parse(String(request.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    const authorisationBody = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(authorisationBody.projectId).toBe(projectId);
    expect(finalisationBody).toEqual({ uploadIntent: "signed-intent" });
    expect(finalisationBody).not.toHaveProperty("uploadUrl");
    expect(finalisationBody).not.toHaveProperty("pathname");
  });

  it("accepts the exact 20 MB application limit without allocating a 20 MB fixture", async () => {
    const request = successfulRequest();
    await expect(uploadSourceWorkbookDirectly(declaredSizeFile(maximumSourceWorkbookBytes), {
      projectId,
      request: request as unknown as typeof fetch,
      directPut: vi.fn(async () => undefined)
    })).resolves.toMatchObject({ sourceWorkbookImportId: "source-1" });
  });

  it("rejects more than 20 MB in the browser before requesting authorisation", async () => {
    const request = successfulRequest();
    await expect(uploadSourceWorkbookDirectly(declaredSizeFile(maximumSourceWorkbookBytes + 1), {
      projectId,
      request: request as unknown as typeof fetch,
      directPut: vi.fn(async () => undefined)
    })).rejects.toThrow("larger than the 20 MB");
    expect(request).not.toHaveBeenCalled();
  });

  it("can recover when the browser loses the PUT response after Blob stored the object", async () => {
    const request = successfulRequest();
    await expect(uploadSourceWorkbookDirectly(declaredSizeFile(5 * 1024 * 1024), {
      projectId,
      request: request as unknown as typeof fetch,
      directPut: vi.fn(async () => { throw new Error("network response lost"); })
    })).resolves.toMatchObject({ sourceWorkbookImportId: "source-1" });
  });

  it("keeps the deployed registration route free of multipart and File request-body handling", () => {
    const route = readFileSync("app/api/data-mapper/source-imports/route.ts", "utf8");
    expect(route).not.toContain("request.formData");
    expect(route).not.toContain("instanceof File");
    expect(route).toContain("request.json");
  });

  it("carries only selected validation fingerprints into secure finalisation", async () => {
    const request = successfulRequest();
    await uploadSourceWorkbookDirectly(declaredSizeFile(1024), {
      projectId,
      request: request as unknown as typeof fetch,
      directPut: vi.fn(async () => undefined),
      ignoredValidationFingerprints: ["fingerprint-1", "fingerprint-2"]
    });
    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body).toEqual({ uploadIntent: "signed-intent", ignoredValidationFingerprints: ["fingerprint-1", "fingerprint-2"] });
    expect(body).not.toHaveProperty("rows");
  });
});
