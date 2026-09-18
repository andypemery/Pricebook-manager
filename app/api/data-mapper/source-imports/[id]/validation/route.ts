import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadSourceValidationState, SourceWorkbookUnavailableError, ValidationIssueOverrideError } from "@/lib/data-mapper/validation-overrides";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  try {
    const state = await loadSourceValidationState(prisma, actor.tenantId, id);
    return NextResponse.json({
      issues: state.issues,
      excludedRows: state.excludedRows,
      blockingCount: state.blockingCount,
      ignoredBlockingCount: state.ignoredBlockingCount,
      unresolvedBlockingCount: state.unresolvedBlockingCount,
      warningCount: state.activeWarningCount,
      totalErrorCount: state.totalErrorCount,
      totalWarningCount: state.totalWarningCount,
      activeErrorCount: state.activeErrorCount,
      activeWarningCount: state.activeWarningCount,
      excludedRowCount: state.excludedRowCount
    });
  } catch (error) {
    if (error instanceof SourceWorkbookUnavailableError) return NextResponse.json({ error: error.message, code: "SOURCE_WORKBOOK_REUPLOAD_REQUIRED" }, { status: 409 });
    if (error instanceof ValidationIssueOverrideError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[Pricebook Manager] Validation state load failed", error);
    return NextResponse.json({ error: "Validation state could not be loaded." }, { status: 500 });
  }
}
