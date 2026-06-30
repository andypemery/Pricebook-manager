"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { allowedLogoTypes, brandingSettingKey, brandingToJson, getTenantBranding, logoUploadLimitBytes, type TenantBranding } from "@/lib/branding";

type LogoSlot = "smallLogo" | "fullLogo";

function cleanSlot(value: FormDataEntryValue | null): LogoSlot | null {
  return value === "smallLogo" || value === "fullLogo" ? value : null;
}

function slotLabel(slot: LogoSlot) {
  return slot === "smallLogo" ? "small app logo" : "full login logo";
}

async function requireBrandingManager() {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { actor, error: "You do not have permission to manage branding settings." };
  return { actor, error: null };
}

export async function uploadBrandingLogoAction(formData: FormData) {
  const { actor, error } = await requireBrandingManager();
  if (error) return { error };
  const slot = cleanSlot(formData.get("slot"));
  if (!slot) return { error: "Choose which logo to update." };
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PNG, JPG or WebP logo file." };
  if (!allowedLogoTypes.includes(file.type as (typeof allowedLogoTypes)[number])) return { error: "Logo files must be PNG, JPG/JPEG or WebP." };
  if (file.size > logoUploadLimitBytes) return { error: "Logo files must be 2 MB or smaller." };

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: slot === "smallLogo" ? "BRANDING_SMALL_LOGO_UPLOAD_BLOCKED" : "BRANDING_FULL_LOGO_UPLOAD_BLOCKED",
    entityType: "TenantSetting",
    entityId: brandingSettingKey,
    reason: "Logo upload storage is not configured for this deployment"
  });
  return { error: `Logo upload is not configured for this deployment yet. ${slotLabel(slot)} was validated but not stored.` };
}

export async function resetBrandingLogoAction(formData: FormData) {
  const { actor, error } = await requireBrandingManager();
  if (error) return { error };
  const slot = cleanSlot(formData.get("slot"));
  if (!slot) return { error: "Choose which logo to reset." };
  const current = await getTenantBranding(actor.tenantId);
  const next: TenantBranding = { ...current, [slot]: null };
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: actor.tenantId, key: brandingSettingKey } },
    update: { value: brandingToJson(next) },
    create: { tenantId: actor.tenantId, key: brandingSettingKey, value: brandingToJson(next) }
  });
  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: slot === "smallLogo" ? "BRANDING_SMALL_LOGO_RESET" : "BRANDING_FULL_LOGO_RESET",
    entityType: "TenantSetting",
    entityId: brandingSettingKey
  });
  revalidatePath("/admin/branding");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: `${slotLabel(slot)} reset to Axiom default.` };
}
