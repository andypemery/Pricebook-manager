import type { PrismaClient } from "@prisma/client";

export class ProjectNotFoundError extends Error {}

export function friendlyWorkbookName(fileName: string | null | undefined) {
  const friendly = (fileName ?? "").replace(/\.(xlsx|xlsm)$/i, "").trim();
  return friendly || "Imported workbook";
}

export function validateProjectName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new Error("Project name is required.");
  if (name.length > 120) throw new Error("Project name must be 120 characters or fewer.");
  return name;
}

export async function listProjects(db: PrismaClient, tenantId: string, take?: number) {
  return db.project.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    ...(take ? { take } : {}),
    select: {
      id: true, name: true, updatedAt: true,
      sourceWorkbookImports: {
        where: { tenantId },
        orderBy: { updatedAt: "desc" }, take: 1,
        select: { id: true, originalFileName: true, validationStatus: true, validatedAt: true, _count: { select: { worksheets: true } } }
      },
      _count: { select: { outputProfiles: { where: { tenantId, outputProfile: { tenantId } } } } }
    }
  });
}

export async function getProjectDashboardMetrics(db: PrismaClient, tenantId: string) {
  const [projectCount, savedProfileCount, needsReviewCount] = await Promise.all([
    db.project.count({ where: { tenantId } }),
    db.outputProfile.count({ where: { tenantId } }),
    db.project.count({
      where: {
        tenantId,
        sourceWorkbookImports: { some: { tenantId, validationStatus: { not: "VALIDATED" } } }
      }
    })
  ]);
  return { projectCount, savedProfileCount, needsReviewCount };
}

export async function getProjectDetail(db: PrismaClient, tenantId: string, projectId: string) {
  return db.project.findFirst({
    where: { id: projectId, tenantId },
    select: {
      id: true, name: true, updatedAt: true,
      sourceWorkbookImports: {
        where: { tenantId },
        orderBy: { updatedAt: "desc" }, take: 1,
        select: {
          id: true,
          originalFileName: true,
          validationStatus: true,
          validatedAt: true,
          worksheets: { orderBy: { position: "asc" }, take: 1, select: { id: true, name: true } },
          _count: { select: { worksheets: true } }
        }
      },
      outputProfiles: {
        where: { tenantId, outputProfile: { tenantId, sourceWorkbookImport: { tenantId } } },
        orderBy: { updatedAt: "desc" },
        select: { outputProfile: { select: { id: true, name: true, outputFormat: true, updatedAt: true, _count: { select: { columns: true } } } } }
      }
    }
  });
}

export async function listAvailableOutputProfilesForProject(db: PrismaClient, tenantId: string, projectId: string) {
  return db.outputProfile.findMany({
    where: {
      tenantId,
      sourceWorkbookImport: { tenantId },
      projects: { none: { projectId, tenantId } }
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      outputFormat: true,
      sourceWorkbookImport: { select: { originalFileName: true } },
      sourceWorksheet: { select: { name: true } },
      _count: { select: { columns: true } }
    }
  });
}

export async function isProjectSourceAvailable(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  sourceWorkbookImportId: string,
  sourceWorksheetId?: string
) {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      tenantId,
      sourceWorkbookImports: {
        some: {
          id: sourceWorkbookImportId,
          tenantId,
          ...(sourceWorksheetId ? { worksheets: { some: { id: sourceWorksheetId } } } : {})
        }
      }
    },
    select: { id: true }
  });
  return Boolean(project);
}

export async function assertProjectSource(db: PrismaClient, tenantId: string, projectId: string, sourceWorkbookImportId: string, sourceWorksheetId?: string) {
  if (!await isProjectSourceAvailable(db, tenantId, projectId, sourceWorkbookImportId, sourceWorksheetId)) {
    throw new ProjectNotFoundError("The Project workbook is not available.");
  }
  return { id: projectId };
}
