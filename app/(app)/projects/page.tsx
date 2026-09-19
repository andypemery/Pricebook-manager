import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { friendlyWorkbookName, listProjects } from "@/lib/data-mapper/projects/repository";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const actor = await requireUser();
  const canView = hasPermission(actor, "viewRecords");
  const projects = canView ? await listProjects(prisma, actor.tenantId) : [];
  const canCreate = hasPermission(actor, "createRecords");
  if (!canView) return <section className="card"><h1>Projects</h1><p className="warningBox">You do not have permission to view Projects.</p></section>;
  return <>
    <section className="hero dashboardHeader"><div className="splitHero"><div><p className="breadcrumb">Axiom Data Mapper</p><h1>Projects</h1><p>Manage each pricebook piece of work, its workbook and reusable Output Profiles.</p></div>{canCreate ? <Link className="primary" href="/projects/new"><Plus aria-hidden="true" size={18} />New Project</Link> : null}</div></section>
    {projects.length === 0 ? <section className="card emptyState"><FolderKanban aria-hidden="true" size={28} /><h2>No Projects yet</h2><p className="muted">Create a Project first, then upload its workbook when you are ready.</p>{canCreate ? <Link className="primary" href="/projects/new">Create Project</Link> : null}</section> : <section className="projectGrid" aria-label="Projects">{projects.map((project) => {
      const workbook = project.sourceWorkbookImports[0];
      const workbookName = workbook ? friendlyWorkbookName(workbook.originalFileName) : "Workbook not uploaded";
      return <Link aria-label={`Open Project ${project.name}`} className="card projectCard projectCardLink" href={`/projects/${project.id}`} key={project.id}><div className="projectCardHeading"><h2 className="projectCardTitle" title={project.name}>{project.name}</h2><p className="muted projectCardWorkbook" title={workbookName}>{workbookName}</p></div><p className="projectCardMeta">{workbook ? `${workbook._count.worksheets} worksheets · ${workbook.validationStatus === "VALIDATED" ? "Ready" : "Needs review"}` : "Upload a workbook to start"}</p><p className="projectCardMeta">{project._count.outputProfiles} associated Output Profiles · Updated {project.updatedAt.toLocaleDateString("en-GB")}</p></Link>;
    })}</section>}
  </>;
}
