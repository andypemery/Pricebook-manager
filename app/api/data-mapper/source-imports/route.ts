import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { friendlyExcelImportMessage } from "@/lib/data-mapper/excel-import";
import { createSourceWorkbookImportFromFile, SourceWorkbookImportError } from "@/lib/data-mapper/output-profiles/source-import";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await requireUser();
  if (!hasPermission(actor, "uploadFiles") || !hasPermission(actor, "editRecords")) {
    return NextResponse.json({ error: "You do not have permission to prepare workbooks for Output Profiles." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("workbook");
    const requestedWorksheetName = String(formData.get("worksheetName") || "");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an Excel workbook to continue." }, { status: 400 });
    const sourceImport = await createSourceWorkbookImportFromFile(prisma, actor, file);
    const selectedWorksheet = sourceImport.worksheets.find((worksheet) => worksheet.name === requestedWorksheetName) ?? sourceImport.worksheets[0];
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
    if (error instanceof SourceWorkbookImportError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = friendlyExcelImportMessage(error);
    if (message !== "The workbook could not be imported. Please check the file and try again.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[Pricebook Manager] Source workbook registration failed", error);
    return NextResponse.json({ error: "The workbook could not be prepared for Output Profiles. Please try again." }, { status: 500 });
  }
}
