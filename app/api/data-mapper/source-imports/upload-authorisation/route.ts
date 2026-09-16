import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  authoriseSourceWorkbookUpload,
  hasSourceWorkbookUploadPermission,
  SourceWorkbookUploadError
} from "@/lib/data-mapper/source-workbook-upload";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await requireUser();
  if (!hasSourceWorkbookUploadPermission(actor)) {
    return NextResponse.json({ error: "You do not have permission to upload source workbooks." }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      fileName?: unknown;
      fileSizeBytes?: unknown;
      contentType?: unknown;
      replaceSourceWorkbookImportId?: unknown;
    };
    const authorisation = await authoriseSourceWorkbookUpload(prisma, actor, {
      fileName: body.fileName,
      fileSizeBytes: body.fileSizeBytes,
      contentType: body.contentType,
      replaceSourceWorkbookImportId: body.replaceSourceWorkbookImportId
    });
    return NextResponse.json(authorisation, { status: 201 });
  } catch (error) {
    if (error instanceof SourceWorkbookUploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[Pricebook Manager] Source workbook upload authorisation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "A secure upload could not be authorised. Please try again." }, { status: 500 });
  }
}
