"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import {
  changeSourceRowExclusions,
  SourceRowExclusionError
} from "@/lib/data-mapper/validation-overrides";
import type { SourceRowReference } from "@/lib/data-mapper/source-row-exclusions";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function updateSourceRowExclusionsAction(input: {
  sourceWorkbookImportId: string;
  rows: SourceRowReference[];
  action: "EXCLUDE" | "RESTORE";
}) {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false as const, error: "You do not have permission to delete or restore source rows." };
  if (!input || typeof input.sourceWorkbookImportId !== "string" || !Array.isArray(input.rows) || !["EXCLUDE", "RESTORE"].includes(input.action)) {
    return { ok: false as const, error: "The source-row change is not valid." };
  }
  try {
    const result = await changeSourceRowExclusions(prisma, actor, input.sourceWorkbookImportId, input.rows, input.action);
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: input.action === "EXCLUDE" ? "SOURCE_ROWS_EXCLUDED" : "SOURCE_ROWS_RESTORED",
      entityType: "SourceWorkbookImport",
      entityId: input.sourceWorkbookImportId,
      after: { count: result.changedCount, worksheetNames: result.worksheetNames }
    });
    revalidatePath("/mapping");
    revalidatePath(`/projects/${result.projectId}/workbook`);
    return { ok: true as const, changedCount: result.changedCount };
  } catch (error) {
    if (error instanceof SourceRowExclusionError || error instanceof Error && error.message.includes("re-uploaded")) {
      return { ok: false as const, error: error.message };
    }
    console.error("[Pricebook Manager] Source-row exclusion failed", error);
    return { ok: false as const, error: "The selected source rows could not be changed. Please try again." };
  }
}
