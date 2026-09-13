import type { PrismaClient } from "@prisma/client";
import type { OutputProfileDraft, SaveOutputProfileInput, SourceWorksheetPreview } from "@/lib/data-mapper/output-profiles/types";
import { stringArrayFromJson, stringMatrixFromJson, validateOutputProfileInput } from "@/lib/data-mapper/output-profiles/validation";

export class OutputProfileNotFoundError extends Error {}

export async function saveOutputProfileForTenant(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  input: SaveOutputProfileInput
) {
  const sourceWorksheet = await db.sourceWorksheet.findFirst({
    where: {
      id: input.sourceWorksheetId,
      sourceWorkbookImportId: input.sourceWorkbookImportId,
      sourceWorkbookImport: { tenantId: actor.tenantId }
    },
    select: { headers: true }
  });
  if (!sourceWorksheet) throw new OutputProfileNotFoundError("The selected source worksheet is not available.");

  const canonicalHeaders = stringArrayFromJson(sourceWorksheet.headers, "Source headings");
  const valid = validateOutputProfileInput(input, canonicalHeaders);
  const columnData = valid.columns.map((column, position) => ({
    columnType: "SOURCE",
    sourceColumnIndex: column.sourceColumnIndex,
    sourceHeading: column.sourceHeading,
    outputHeading: column.outputHeading,
    position
  }));

  if (valid.id) {
    const existing = await db.outputProfile.findFirst({ where: { id: valid.id, tenantId: actor.tenantId }, select: { id: true } });
    if (!existing) throw new OutputProfileNotFoundError("The Output Profile is not available.");
    return db.outputProfile.update({
      where: { id: existing.id },
      data: {
        name: valid.name,
        sourceWorkbookImportId: valid.sourceWorkbookImportId,
        sourceWorksheetId: valid.sourceWorksheetId,
        updatedById: actor.id,
        columns: { deleteMany: {}, create: columnData }
      },
      select: { id: true, name: true, updatedAt: true }
    });
  }

  return db.outputProfile.create({
    data: {
      tenantId: actor.tenantId,
      name: valid.name,
      sourceWorkbookImportId: valid.sourceWorkbookImportId,
      sourceWorksheetId: valid.sourceWorksheetId,
      createdById: actor.id,
      updatedById: actor.id,
      columns: { create: columnData }
    },
    select: { id: true, name: true, updatedAt: true }
  });
}
export async function listOutputProfileWorkspace(db: PrismaClient, tenantId: string) {
  const [profiles, sourceImports] = await Promise.all([
    db.outputProfile.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        _count: { select: { columns: true } },
        sourceWorkbookImport: { select: { originalFileName: true } },
        sourceWorksheet: { select: { name: true } }
      }
    }),
    db.sourceWorkbookImport.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFileName: true,
        validationStatus: true,
        validatedAt: true,
        worksheets: { orderBy: { position: "asc" }, select: { id: true, name: true, rowCount: true, columnCount: true } }
      }
    })
  ]);
  return { profiles, sourceImports };
}

export async function loadOutputProfileBuilder(
  db: PrismaClient,
  tenantId: string,
  selection: { profileId?: string; sourceWorkbookImportId?: string; sourceWorksheetId?: string }
): Promise<{ source: SourceWorksheetPreview; draft: OutputProfileDraft } | null> {
  if (selection.profileId) {
    const profile = await db.outputProfile.findFirst({
      where: { id: selection.profileId, tenantId },
      select: {
        id: true,
        name: true,
        sourceWorkbookImportId: true,
        sourceWorksheetId: true,
        columns: { orderBy: { position: "asc" }, select: { id: true, sourceColumnIndex: true, sourceHeading: true, outputHeading: true } },
        sourceWorkbookImport: { select: { originalFileName: true } },
        sourceWorksheet: { select: { id: true, name: true, headers: true, sampleRows: true } }
      }
    });
    if (!profile) return null;
    const headers = stringArrayFromJson(profile.sourceWorksheet.headers, "Source headings");
    const sampleRows = stringMatrixFromJson(profile.sourceWorksheet.sampleRows, "Source sample rows").slice(0, 3);
    return {
      source: {
        id: profile.sourceWorksheet.id,
        sourceWorkbookImportId: profile.sourceWorkbookImportId,
        workbookFileName: profile.sourceWorkbookImport.originalFileName,
        worksheetName: profile.sourceWorksheet.name,
        headers,
        sampleRows
      },
      draft: {
        id: profile.id,
        name: profile.name,
        sourceWorkbookImportId: profile.sourceWorkbookImportId,
        sourceWorksheetId: profile.sourceWorksheetId,
        columns: profile.columns.map((column) => ({
          clientId: column.id,
          sourceColumnIndex: column.sourceColumnIndex ?? -1,
          sourceHeading: column.sourceHeading ?? "",
          outputHeading: column.outputHeading
        }))
      }
    };
  }

  if (!selection.sourceWorkbookImportId || !selection.sourceWorksheetId) return null;
  const worksheet = await db.sourceWorksheet.findFirst({
    where: {
      id: selection.sourceWorksheetId,
      sourceWorkbookImportId: selection.sourceWorkbookImportId,
      sourceWorkbookImport: { tenantId }
    },
    select: {
      id: true,
      name: true,
      headers: true,
      sampleRows: true,
      sourceWorkbookImportId: true,
      sourceWorkbookImport: { select: { originalFileName: true } }
    }
  });
  if (!worksheet) return null;
  return {
    source: {
      id: worksheet.id,
      sourceWorkbookImportId: worksheet.sourceWorkbookImportId,
      workbookFileName: worksheet.sourceWorkbookImport.originalFileName,
      worksheetName: worksheet.name,
      headers: stringArrayFromJson(worksheet.headers, "Source headings"),
      sampleRows: stringMatrixFromJson(worksheet.sampleRows, "Source sample rows").slice(0, 3)
    },
    draft: {
      id: null,
      name: "",
      sourceWorkbookImportId: worksheet.sourceWorkbookImportId,
      sourceWorksheetId: worksheet.id,
      columns: []
    }
  };
}
