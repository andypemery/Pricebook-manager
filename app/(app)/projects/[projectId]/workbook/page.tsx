import { notFound } from "next/navigation";
import { WorkbookImporter } from "@/components/data-mapper/workbook-importer";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getProjectDetail } from "@/lib/data-mapper/projects/repository";
import { prisma } from "@/lib/prisma";

export default async function ProjectWorkbookPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ replace?: string; source?: string }> }) {
  const { projectId } = await params;
  const { replace, source } = await searchParams;
  const actor = await requireUser();
  if (!hasPermission(actor, "viewRecords")) notFound();
  const project = await getProjectDetail(prisma, actor.tenantId, projectId);
  if (!project) notFound();
  const workbook = project.sourceWorkbookImports[0];
  if (source && source !== workbook?.id) notFound();
  if (replace && replace !== workbook?.id) notFound();
  return <WorkbookImporter projectId={project.id} projectName={project.name} replaceSourceWorkbookImportId={replace ?? undefined} canPrepareOutputProfiles={hasPermission(actor, "uploadFiles") && hasPermission(actor, "editRecords")} />;
}
