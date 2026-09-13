"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import {
  deleteOutputProfileForTenant,
  duplicateOutputProfileForTenant,
  saveOutputProfileForTenant,
  OutputProfileNotFoundError
} from "@/lib/data-mapper/output-profiles/repository";
import type { OutputProfileMutationResult, SaveOutputProfileInput, SaveOutputProfileResult } from "@/lib/data-mapper/output-profiles/types";
import { OutputProfileValidationError } from "@/lib/data-mapper/output-profiles/validation";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function saveOutputProfileAction(input: SaveOutputProfileInput): Promise<SaveOutputProfileResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to edit Output Profiles." };

  try {
    const profile = await saveOutputProfileForTenant(prisma, actor, input);
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: input.id ? "OUTPUT_PROFILE_UPDATED" : "OUTPUT_PROFILE_CREATED",
      entityType: "OutputProfile",
      entityId: profile.id,
      after: {
        name: profile.name,
        outputColumnCount: input.columns.length,
        filterCount: input.filters.length,
        filterMatchMode: input.filterMatchMode,
        outputFormat: input.outputFormat
      }
    });
    revalidatePath("/mapping");
    return { ok: true, profileId: profile.id, message: "Output Profile saved." };
  } catch (error) {
    if (error instanceof OutputProfileValidationError || error instanceof OutputProfileNotFoundError) {
      return { ok: false, error: error.message };
    }
    console.error("[Pricebook Manager] Output Profile save failed", error);
    return { ok: false, error: "The Output Profile could not be saved. Please try again." };
  }
}

export async function duplicateOutputProfileAction(profileId: string): Promise<OutputProfileMutationResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to duplicate Output Profiles." };
  if (typeof profileId !== "string" || !profileId.trim() || profileId.length > 100) return { ok: false, error: "The Output Profile is not available." };

  try {
    const duplicate = await duplicateOutputProfileForTenant(prisma, actor, profileId);
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "OUTPUT_PROFILE_DUPLICATED",
      entityType: "OutputProfile",
      entityId: duplicate.id,
      after: { name: duplicate.name, duplicatedFromId: profileId }
    });
    revalidatePath("/mapping");
    return { ok: true, profileId: duplicate.id, message: "Output Profile duplicated." };
  } catch (error) {
    if (error instanceof OutputProfileValidationError || error instanceof OutputProfileNotFoundError) return { ok: false, error: error.message };
    console.error("[Pricebook Manager] Output Profile duplication failed", error);
    return { ok: false, error: "The Output Profile could not be duplicated. Please try again." };
  }
}

export async function deleteOutputProfileAction(profileId: string): Promise<OutputProfileMutationResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to delete Output Profiles." };
  if (typeof profileId !== "string" || !profileId.trim() || profileId.length > 100) return { ok: false, error: "The Output Profile is not available." };

  try {
    const deleted = await deleteOutputProfileForTenant(prisma, actor.tenantId, profileId);
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "OUTPUT_PROFILE_DELETED",
      entityType: "OutputProfile",
      entityId: deleted.id,
      before: { name: deleted.name, sourceWorkbookImportId: deleted.sourceWorkbookImportId, sourceWorksheetId: deleted.sourceWorksheetId }
    });
    revalidatePath("/mapping");
    return { ok: true, profileId: deleted.id, message: "Output Profile deleted." };
  } catch (error) {
    if (error instanceof OutputProfileNotFoundError) return { ok: false, error: error.message };
    console.error("[Pricebook Manager] Output Profile deletion failed", error);
    return { ok: false, error: "The Output Profile could not be deleted. Please try again." };
  }
}
