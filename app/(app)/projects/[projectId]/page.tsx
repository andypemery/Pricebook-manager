import Link from "next/link";
import { notFound } from "next/navigation";
import { renameProjectAction } from "@/lib/actions/project.actions";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  friendlyWorkbookName,
  getProjectDetail
} from "@/lib/data-mapper/projects/repository";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const actor = await requireUser();
  if (!hasPermission(actor, "viewRecords")) notFound();
  const project = await getProjectDetail(prisma, actor.tenantId, projectId);
  if (!project) notFound();

  const workbook = project.sourceWorkbookImports[0];
  const referenceWorksheet = workbook?.worksheets[0];
  const canEdit = hasPermission(actor, "editRecords");

  async function renameProjectForm(formData: FormData) {
    "use server";
    await renameProjectAction(projectId, formData);
  }

  const builderQuery = workbook && referenceWorksheet
    ? `project=${encodeURIComponent(project.id)}&source=${encodeURIComponent(workbook.id)}&worksheet=${encodeURIComponent(referenceWorksheet.id)}${project.outputProfiles[0] ? `&apply=${encodeURIComponent(project.outputProfiles[0].outputProfile.id)}` : ""}`
    : null;

  return <>
    <section className="hero dashboardHeader">
      <div className="splitHero">
        <div>
          <p className="breadcrumb"><Link href="/projects">Projects</Link> · Project</p>
          <h1 title={project.name}>{project.name}</h1>
          <p>Resume workbook review and build output from one place.</p>
        </div>
        <div className="actions"><Link className="secondary" href="/dashboard">Dashboard</Link><Link className="secondary" href="/projects">Projects</Link></div>
      </div>
      {canEdit ? <form action={renameProjectForm} className="projectRename"><label className="field"><span>Rename Project</span><input name="name" defaultValue={project.name} maxLength={120} required /></label><button className="secondary" type="submit">Rename</button></form> : null}
    </section>

    <section className="card">
      <div className="sectionHeader">
        <div>
          <p className="sheetLabel">Source workbook</p>
          <h2>{workbook ? friendlyWorkbookName(workbook.originalFileName) : "Workbook not uploaded"}</h2>
          <p className="muted">{workbook ? `${workbook._count.worksheets} worksheets · ${workbook.validationStatus === "VALIDATED" ? "Ready" : "Needs review"} · Prepared ${workbook.validatedAt.toLocaleDateString("en-GB")}` : "Upload a workbook to start this Project."}</p>
        </div>
        {workbook ? <div className="actions"><Link className="primary" href={`/projects/${project.id}/workbook?source=${encodeURIComponent(workbook.id)}`}>Review workbook</Link><Link className="secondary" href={`/projects/${project.id}/workbook?replace=${encodeURIComponent(workbook.id)}`}>Replace workbook</Link></div> : <Link className="primary" href={`/projects/${project.id}/workbook`}>Upload workbook</Link>}
      </div>
    </section>

    <section className="card" id="output-profiles">
      <div className="sectionHeader">
        <div>
          <p className="sheetLabel">Output</p>
          <h2>Build Output</h2>
          <p className="muted">{project.outputProfiles.length === 0
            ? "No reusable Output Profiles have been used with this Project yet."
            : `${project.outputProfiles.length} reusable Output ${project.outputProfiles.length === 1 ? "Profile has" : "Profiles have"} been used with this Project.`}</p>
        </div>
        {builderQuery ? <Link className="primary" href={`/mapping?${builderQuery}`}>Build output</Link> : null}
      </div>
      {project.outputProfiles.length > 0 ? <div className="projectProfileChips" aria-label="Profiles used">{project.outputProfiles.map(({ outputProfile }) => <span className="badge" key={outputProfile.id}>{outputProfile.name}</span>)}</div> : !workbook ? <p className="muted">Upload a workbook before building output.</p> : null}
    </section>
  </>;
}
