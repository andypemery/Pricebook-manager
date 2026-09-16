import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { generateOutputForTenant, OutputGenerationError, SourceWorkbookUnavailableError } from "@/lib/data-mapper/output-profiles/generation";
import type { SaveOutputProfileInput } from "@/lib/data-mapper/output-profiles/types";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return NextResponse.json({ error: "You do not have permission to generate output files." }, { status: 403 });
  try {
    const body = await request.json() as { draft?: SaveOutputProfileInput; effectiveDate?: string };
    if (!body.draft || typeof body.effectiveDate !== "string") return NextResponse.json({ error: "The output definition is not valid." }, { status: 400 });
    const output = await generateOutputForTenant(prisma, actor, body.draft, body.effectiveDate);
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: "OUTPUT_FILE_GENERATED", entityType: "SourceWorkbookImport", entityId: body.draft.sourceWorkbookImportId, after: { rowCount: output.rowCount, outputFormat: body.draft.outputFormat, ignoredBlockingCount: output.ignoredBlockingCount } });
    return new NextResponse(output.bytes, { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="${output.fileName.replaceAll('"', "")}"`, "X-Generated-Row-Count": String(output.rowCount), "X-Ignored-Blocking-Errors": String(output.ignoredBlockingCount), "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OutputGenerationError || error instanceof SourceWorkbookUnavailableError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[Pricebook Manager] Output generation failed", error);
    return NextResponse.json({ error: "The output file could not be generated. Please try again." }, { status: 500 });
  }
}
