import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { brandingConfig } from "@/config/branding.config";

export const brandingSettingKey = "branding";
export const logoUploadLimitBytes = 2 * 1024 * 1024;
export const allowedLogoTypes = ["image/png", "image/jpeg", "image/webp"] as const;

export type BrandingLogo = {
  url: string;
  originalFileName?: string;
  contentType?: string;
  fileSizeBytes?: number;
  updatedAt?: string;
  updatedById?: string;
};

export type TenantBranding = {
  smallLogo?: BrandingLogo | null;
  fullLogo?: BrandingLogo | null;
};

function isLogo(value: unknown): value is BrandingLogo {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { url?: unknown }).url === "string");
}

export function parseTenantBranding(value: unknown): TenantBranding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as { smallLogo?: unknown; fullLogo?: unknown };
  return {
    smallLogo: isLogo(candidate.smallLogo) ? candidate.smallLogo : null,
    fullLogo: isLogo(candidate.fullLogo) ? candidate.fullLogo : null
  };
}

export async function getTenantBranding(tenantId?: string | null): Promise<TenantBranding> {
  if (!tenantId) return {};
  const setting = await prisma.tenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: brandingSettingKey } } });
  return parseTenantBranding(setting?.value);
}

export async function getSingleTenantLoginBranding(): Promise<TenantBranding> {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
      take: 2
    });
    if (tenants.length !== 1) return {};
    return getTenantBranding(tenants[0].id);
  } catch {
    return {};
  }
}

export function appShellLogoPath(branding: TenantBranding) {
  return branding.smallLogo?.url || brandingConfig.smallLogoPath;
}

export function loginLogoPath(branding: TenantBranding) {
  return branding.fullLogo?.url || brandingConfig.fullLogoPath;
}

export function brandingStatus(branding: TenantBranding) {
  return branding.smallLogo?.url || branding.fullLogo?.url ? "Customer branding active" : "Default Axiom branding";
}

export function brandingToJson(branding: TenantBranding): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(branding)) as Prisma.InputJsonValue;
}
