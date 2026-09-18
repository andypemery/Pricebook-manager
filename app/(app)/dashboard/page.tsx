export const dynamic = "force-dynamic";

import Link from "next/link";
import { Columns3, FolderKanban, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listReusableOutputProfiles } from "@/lib/data-mapper/output-profiles/repository";
import { friendlyWorkbookName, getProjectDashboardMetrics, listProjects } from "@/lib/data-mapper/projects/repository";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const actor = await requireUser();
  const canCreate = hasPermission(actor, "createRecords");
  const canViewProjects = hasPermission(actor, "viewRecords");
  const [projects, profiles, metrics] = await Promise.all([
    canViewProjects ? listProjects(prisma, actor.tenantId, 4) : Promise.resolve([]),
    listReusableOutputProfiles(prisma, actor.tenantId, 6),
    canViewProjects
      ? getProjectDashboardMetrics(prisma, actor.tenantId)
      : prisma.outputProfile.count({ where: { tenantId: actor.tenantId } }).then((savedProfileCount) => ({ projectCount: 0, savedProfileCount, needsReviewCount: 0 }))
  ]);

  return (
    <>
      <section className="hero dashboardHeader">
        <div className="splitHero">
          <div>
            <p className="breadcrumb">Axiom Data Mapper</p>
            <h1>Dashboard</h1>
            <p>Continue recent work or start a new Project.</p>
          </div>
          <div className="actions">
            {canCreate ? <Link className="primary" href="/projects/new"><Plus aria-hidden="true" size={18} />New Project</Link> : null}
            <Link className="secondary" href="/mapping"><Columns3 aria-hidden="true" size={18} />Output Profiles</Link>
          </div>
        </div>
      </section>

      <section className="dashboardAtAGlance" aria-label="At a Glance"><div><FolderKanban aria-hidden="true" size={18} /><strong>{metrics.projectCount}</strong><span>Projects</span></div><div><Columns3 aria-hidden="true" size={18} /><strong>{metrics.savedProfileCount}</strong><span>Saved profiles</span></div><div><strong>{metrics.needsReviewCount}</strong><span>Needs review</span></div></section>
      <section className="card"><div className="dashboardSectionHeader"><div><h2>Continue Working</h2><p className="muted">Recent Projects and their current workbook status.</p></div><Link className="secondary" href="/projects">View all Projects</Link></div>{projects.length ? <div className="projectGrid">{projects.map((project) => { const workbook = project.sourceWorkbookImports[0]; return <article className="projectCard" key={project.id}><strong title={project.name}>{project.name}</strong><span title={workbook?.originalFileName}>{workbook ? friendlyWorkbookName(workbook.originalFileName) : "Workbook not uploaded"}</span><small>{workbook?.validationStatus === "VALIDATED" ? "Ready" : workbook ? "Needs review" : "Upload a workbook to start"} · Updated {project.updatedAt.toLocaleDateString("en-GB")}</small><Link className="secondary" href={`/projects/${project.id}`}>Open Project</Link></article>; })}</div> : <div className="emptyState"><p className="muted">No Projects yet.</p>{canCreate ? <Link className="primary" href="/projects/new">Create Project</Link> : null}</div>}</section>
      <section className="card"><div className="dashboardSectionHeader"><div><h2>Saved Output Profiles</h2><p className="muted">Reusable templates available across Projects.</p></div><Link className="secondary" href="/mapping">Output Profiles</Link></div>{profiles.length ? <div className="projectProfileGrid">{profiles.map((profile) => <Link className="projectProfileCard" href={`/mapping?profile=${encodeURIComponent(profile.id)}`} key={profile.id}><strong>{profile.name}</strong><span>{profile.outputFormat} · {profile.outputColumnCount} columns</span></Link>)}</div> : <div className="emptyState"><p className="muted">No saved Output Profiles yet.</p></div>}</section>
    </>
  );
}
