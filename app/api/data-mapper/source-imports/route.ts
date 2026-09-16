import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { friendlyExcelImportMessage } from "@/lib/data-mapper/excel-import";
import { finaliseSourceWorkbookUpload, SourceWorkbookImportError, SourceWorkbookUploadError } from "@/lib/data-mapper/output-profiles/source-import";
import { hasSourceWorkbookUploadPermission } from "@/lib/data-mapper/source-workbook-upload";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await requireUser();
  if (!hasSourceWorkbookUploadPermission(actor)) {
    return NextResponse.json({ error: "You do not have permission to prepare workbooks for Output Profiles." }, { status: 403 });
  }

  try {
    const body = await request.json() as { uploadIntent?: unknown; worksheetName?: unknown };
    if (typeof body.uploadIntent !== "string") return NextResponse.json({ error: "Upload the workbook directly to private storage before registering it." }, { status: 400 });
    const requestedWorksheetName = typeof body.worksheetName === "string" ? body.worksheetName : "";
    const sourceImport = await finaliseSourceWorkbookUpload(prisma, actor, { uploadIntent: body.uploadIntent, worksheetName: requestedWorksheetName });
    const selectedWorksheet = sourceImport.worksheets.find((worksheet) => worksheet.name === requestedWorksheetName) ?? sourceImport.worksheets[0];
    if (!selectedWorksheet) return NextResponse.json({ error: "The workbook does not contain a worksheet available for Output Profiles." }, { status: 400 });
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "SOURCE_WORKBOOK_VALIDATED",
      entityType: "SourceWorkbookImport",
      entityId: sourceImport.id,
      after: { originalFileName: sourceImport.originalFileName, worksheetCount: sourceImport.worksheets.length }
    });
    return NextResponse.json({
      sourceWorkbookImportId: sourceImport.id,
      sourceWorksheetId: selectedWorksheet.id,
      mappingUrl: `/mapping?source=${encodeURIComponent(sourceImport.id)}&worksheet=${encodeURIComponent(selectedWorksheet.id)}`
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SourceWorkbookImportError || error instanceof SourceWorkbookUploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = friendlyExcelImportMessage(error);
    if (message !== "The workbook could not be imported. Please check the file and try again.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[Pricebook Manager] Source workbook registration failed", error);
    return NextResponse.json({ error: "The workbook could not be prepared for Output Profiles. Please try again." }, { status: 500 });
  }
}
