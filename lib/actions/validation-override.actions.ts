"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { changeValidationIssueOverrides, ValidationIssueOverrideError } from "@/lib/data-mapper/validation-overrides";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function updateValidationIssueOverridesAction(input: { sourceWorkbookImportId: string; fingerprints: string[]; action: "IGNORE" | "RESTORE" }) {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false as const, error: "You do not have permission to ignore validation errors." };
  if (!input || typeof input.sourceWorkbookImportId !== "string" || !Array.isArray(input.fingerprints) || !["IGNORE", "RESTORE"].includes(input.action)) {
    return { ok: false as const, error: "The validation change is not valid." };
  }
  try {
    const state = await changeValidationIssueOverrides(prisma, actor, input.sourceWorkbookImportId, input.fingerprints, input.action);
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: input.action === "IGNORE" ? "VALIDATION_ISSUES_IGNORED" : "VALIDATION_ISSUES_RESTORED", entityType: "SourceWorkbookImport", entityId: input.sourceWorkbookImportId, after: { issueCount: input.fingerprints.length } });
    revalidatePath("/mapping");
    revalidatePath(`/projects/${state.source.projectId}/workbook`);
    return { ok: true as const, blockingCount: state.blockingCount, ignoredBlockingCount: state.ignoredBlockingCount, unresolvedBlockingCount: state.unresolvedBlockingCount };
  } catch (error) {
    if (error instanceof ValidationIssueOverrideError || error instanceof Error && error.message.includes("re-uploaded")) return { ok: false as const, error: error.message };
    console.error("[Pricebook Manager] Validation override failed", error);
    return { ok: false as const, error: "The validation override could not be saved. Please try again." };
  }
}
