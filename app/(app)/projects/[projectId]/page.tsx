import Link from "next/link";
import { notFound } from "next/navigation";
import {
  attachOutputProfileToProjectAction,
  removeOutputProfileFromProjectAction,
  renameProjectAction
} from "@/lib/actions/project.actions";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  friendlyWorkbookName,
  getProjectDetail,
  listAvailableOutputProfilesForProject
} from "@/lib/data-mapper/projects/repository";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const actor = await requireUser();
  if (!hasPermission(actor, "viewRecords")) notFound();
  const [project, availableProfiles] = await Promise.all([
    getProjectDetail(prisma, actor.tenantId, projectId),
    listAvailableOutputProfilesForProject(prisma, actor.tenantId, projectId)
  ]);
  if (!project) notFound();

  const workbook = project.sourceWorkbookImports[0];
  const referenceWorksheet = workbook?.worksheets[0];
  const canEdit = hasPermission(actor, "editRecords");

  async function renameProjectForm(formData: FormData) {
    "use server";
    await renameProjectAction(projectId, formData);
  }

  async function attachProfileForm(formData: FormData) {
    "use server";
    const outputProfileId = formData.get("outputProfileId");
    if (typeof outputProfileId === "string") await attachOutputProfileToProjectAction(projectId, outputProfileId);
  }

  async function removeProfileForm(formData: FormData) {
    "use server";
    const outputProfileId = formData.get("outputProfileId");
    if (typeof outputProfileId === "string") await removeOutputProfileFromProjectAction(projectId, outputProfileId);
  }

  const builderQuery = workbook && referenceWorksheet
    ? `project=${encodeURIComponent(project.id)}&source=${encodeURIComponent(workbook.id)}&worksheet=${encodeURIComponent(referenceWorksheet.id)}`
    : null;

  return <>
    <section className="hero dashboardHeader">
      <div className="splitHero">
        <div>
          <p className="breadcrumb"><Link href="/projects">Projects</Link> · Project</p>
          <h1 title={project.name}>{project.name}</h1>
          <p>Keep the workbook and reusable Output Profiles for this work together.</p>
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
        {workbook ? <div className="actions"><Link className="primary" href={`/projects/${project.id}/workbook?source=${encodeURIComponent(workbook.id)}`}>Open workbook</Link><Link className="secondary" href={`/projects/${project.id}/workbook?replace=${encodeURIComponent(workbook.id)}`}>Replace workbook</Link></div> : <Link className="primary" href={`/projects/${project.id}/workbook`}>Upload workbook</Link>}
      </div>
    </section>

    <section className="card" id="output-profiles">
      <div className="sectionHeader">
        <div><p className="sheetLabel">Reusable templates</p><h2>Output Profiles</h2><p className="muted">Profiles remain tenant-level masters that can be used across Projects.</p></div>
        {builderQuery ? <Link className="secondary" href={`/mapping?${builderQuery}`}>Create New Output Profile</Link> : null}
      </div>

      {canEdit && availableProfiles.length > 0 ? <form action={attachProfileForm} className="projectProfileAttach">
        <label className="field"><span>Add existing Output Profile</span><select name="outputProfileId" required defaultValue=""><option value="" disabled>Choose a reusable profile</option>{availableProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.outputFormat} · {profile._count.columns} columns</option>)}</select></label>
        <button className="secondary" type="submit">Add to Project</button>
      </form> : null}

      {project.outputProfiles.length ? <div className="projectProfileGrid">{project.outputProfiles.map(({ outputProfile }) => <article className="projectProfileCard" key={outputProfile.id}>
        <strong>{outputProfile.name}</strong>
        <span>{outputProfile.outputFormat} · {outputProfile._count.columns} columns · Updated {outputProfile.updatedAt.toLocaleDateString("en-GB")}</span>
        <div className="actions">
          {builderQuery ? <Link className="secondary" href={`/mapping?${builderQuery}&apply=${encodeURIComponent(outputProfile.id)}`}>Build Output</Link> : null}
          {canEdit ? <form action={removeProfileForm}><input type="hidden" name="outputProfileId" value={outputProfile.id} /><button className="secondary" type="submit">Remove from Project</button></form> : null}
        </div>
      </article>)}</div> : <div className="emptyState"><p className="muted">No Output Profiles are associated with this Project yet.</p>{!workbook ? <p className="muted">Upload a workbook before creating a new profile.</p> : null}</div>}
    </section>
  </>;
}
