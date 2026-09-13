"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { saveOutputProfileForTenant, OutputProfileNotFoundError } from "@/lib/data-mapper/output-profiles/repository";
import type { SaveOutputProfileInput, SaveOutputProfileResult } from "@/lib/data-mapper/output-profiles/types";
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
      after: { name: profile.name, outputColumnCount: input.columns.length, filterCount: input.filters.length, filterMatchMode: input.filterMatchMode }
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
