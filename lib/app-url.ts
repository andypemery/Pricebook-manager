function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normaliseVercelUrl(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\//, "");
  return trimmed ? `https://${stripTrailingSlash(trimmed)}` : "";
}

function isLocalhostUrl(value: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(stripTrailingSlash(value));
}

export function isRealProductionDeployment() {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

export function requireProductionHttpsAppUrl() {
  if (!isRealProductionDeployment()) return;
  const appUrl = String(process.env.APP_URL || "").trim();
  if (!appUrl) throw new Error("Production APP_URL is required and must be the stable HTTPS customer-facing URL.");
  if (!appUrl.startsWith("https://")) throw new Error("Production APP_URL must start with https:// for browser-to-server encryption in transit.");
}

export function getAppBaseUrl() {
  requireProductionHttpsAppUrl();
  const appUrl = stripTrailingSlash(String(process.env.APP_URL || "").trim());
  if (appUrl) {
    if (appUrl.startsWith("https://") || isLocalhostUrl(appUrl)) return appUrl;
    throw new Error("APP_URL must be HTTPS, except for http://localhost or http://127.0.0.1 in local development.");
  }

  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = normaliseVercelUrl(String(process.env.VERCEL_URL || ""));
  if (vercelEnv === "preview" && vercelUrl) return vercelUrl;
  if (vercelEnv === "development" && vercelUrl) return vercelUrl;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";

  throw new Error("APP_URL is required for production link generation.");
}

export function getAppUrl(path: string) {
  const normalisedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalisedPath}`;
}
