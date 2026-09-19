import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkbookImporter } from "@/components/data-mapper/workbook-importer";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getProjectDetail } from "@/lib/data-mapper/projects/repository";
import { loadPersistedWorkbookReview } from "@/lib/data-mapper/persisted-workbook-review";
import { SourceWorkbookUnavailableError } from "@/lib/data-mapper/validation-overrides";
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
  const canPrepareOutputProfiles = hasPermission(actor, "uploadFiles") && hasPermission(actor, "editRecords");

  if (!workbook || replace) {
    return <WorkbookImporter
      projectId={project.id}
      projectName={project.name}
      replaceSourceWorkbookImportId={replace ?? undefined}
      canPrepareOutputProfiles={canPrepareOutputProfiles}
      canEditReview={hasPermission(actor, "editRecords")}
    />;
  }

  let review: Awaited<ReturnType<typeof loadPersistedWorkbookReview>> | null = null;
  let sourceUnavailable = false;
  try {
    review = await loadPersistedWorkbookReview(prisma, actor.tenantId, project.id, workbook.id);
  } catch (error) {
    if (!(error instanceof SourceWorkbookUnavailableError)) throw error;
    sourceUnavailable = true;
  }

  if (sourceUnavailable) {
    return <>
      <section className="hero">
        <div className="splitHero">
          <div>
            <p className="breadcrumb"><Link href="/projects">Projects</Link> › <Link href={`/projects/${project.id}`}>{project.name}</Link> › Review workbook</p>
            <h1>Review workbook</h1>
            <p>The retained source file is unavailable for this historical workbook.</p>
          </div>
          <Link className="secondary" href={`/projects/${project.id}`}>Project</Link>
        </div>
      </section>
      <section className="card emptyState">
        <h2>This source workbook needs to be re-uploaded before it can be reviewed.</h2>
        <p className="muted">Re-uploading replaces the missing retained source while keeping this Project.</p>
        {canPrepareOutputProfiles ? <Link className="primary" href={`/projects/${project.id}/workbook?replace=${encodeURIComponent(workbook.id)}`}>Re-upload workbook</Link> : <p className="warningBox">Ask someone with workbook upload permission to re-upload this source.</p>}
      </section>
    </>;
  }
  if (!review) notFound();

  const referenceWorksheet = workbook.worksheets[0];
  const latestProfileId = project.outputProfiles[0]?.outputProfile.id;
  const buildOutputUrl = referenceWorksheet
    ? `/mapping?project=${encodeURIComponent(project.id)}&source=${encodeURIComponent(workbook.id)}&worksheet=${encodeURIComponent(referenceWorksheet.id)}${latestProfileId ? `&apply=${encodeURIComponent(latestProfileId)}` : ""}`
    : null;
  return <WorkbookImporter
    key={review.reviewStateKey}
    projectId={project.id}
    projectName={project.name}
    canPrepareOutputProfiles={canPrepareOutputProfiles}
    canEditReview={hasPermission(actor, "editRecords")}
    persistedReview={review}
    buildOutputUrl={buildOutputUrl}
  />;
}
