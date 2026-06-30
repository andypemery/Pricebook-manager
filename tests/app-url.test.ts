import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppBaseUrl, getAppUrl, requireProductionHttpsAppUrl } from "../lib/app-url";

describe("app URL helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires APP_URL in real production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() => requireProductionHttpsAppUrl()).toThrow("Production APP_URL is required");
  });

  it("rejects non-HTTPS APP_URL in real production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "http://example.com");
    expect(() => requireProductionHttpsAppUrl()).toThrow("must start with https://");
  });

  it("uses production APP_URL for generated links", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://app.example.com/");
    vi.stubEnv("VERCEL_URL", "preview.example.vercel.app");
    expect(getAppUrl("/reset-password?token=abc")).toBe("https://app.example.com/reset-password?token=abc");
  });

  it("uses VERCEL_URL temporarily in preview when APP_URL is missing", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_URL", "preview.example.vercel.app");
    expect(getAppBaseUrl()).toBe("https://preview.example.vercel.app");
  });

  it("allows localhost for local development", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });
});
