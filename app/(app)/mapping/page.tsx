import Link from "next/link";
import { OutputProfileBuilder } from "@/components/data-mapper/output-profile-builder";
import { requireUser } from "@/lib/auth";
import {
  listReusableOutputProfiles,
  listTenantOutputProfilesForProject,
  loadOutputProfileBuilder
} from "@/lib/data-mapper/output-profiles/repository";
import { defaultEffectiveDate } from "@/lib/data-mapper/output-profiles/filename";
import { isProjectSourceAvailable } from "@/lib/data-mapper/projects/repository";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type MappingSearchParams = Promise<{ project?: string; profile?: string; apply?: string; source?: string; worksheet?: string }>;

function UnavailableSelection() {
  return <section className="card outputProfileWelcome">
    <h1>Output Profile unavailable</h1>
    <p className="warningBox">That Project, workbook worksheet or Output Profile is not available to your account.</p>
    <div className="actions"><Link className="primary" href="/projects">Open Projects</Link><Link className="secondary" href="/mapping">Output Profiles</Link></div>
  </section>;
}

export default async function MappingPage({ searchParams }: { searchParams: MappingSearchParams }) {
  const actor = await requireUser();
  const params = await searchParams;
  if (params.project && !hasPermission(actor, "viewRecords")) return <UnavailableSelection />;
  const project = params.project
    ? await prisma.project.findFirst({ where: { id: params.project, tenantId: actor.tenantId }, select: { id: true, name: true } })
    : null;

  if (params.project && !project) return <UnavailableSelection />;

  const projectProfileId = params.apply ?? params.profile;
  const hasSourcePair = Boolean(params.source && params.worksheet);
  const hasPartialSourcePair = Boolean(params.source) !== Boolean(params.worksheet);

  if (!project && (params.apply || params.source || params.worksheet)) return <UnavailableSelection />;
  if (project && (hasPartialSourcePair || (projectProfileId && !hasSourcePair))) return <UnavailableSelection />;

  if (project && hasSourcePair) {
    const sourceAvailable = await isProjectSourceAvailable(prisma, actor.tenantId, project.id, params.source!, params.worksheet!);
    if (!sourceAvailable) return <UnavailableSelection />;
  }

  const selection = project
    ? {
        applyProfileId: projectProfileId,
        sourceWorkbookImportId: params.source,
        sourceWorksheetId: params.worksheet
      }
    : { profileId: params.profile };
  const [profiles, builderData] = await Promise.all([
    project ? listTenantOutputProfilesForProject(prisma, actor.tenantId, project.id) : listReusableOutputProfiles(prisma, actor.tenantId),
    loadOutputProfileBuilder(prisma, actor.tenantId, selection)
  ]);
  const canEdit = hasPermission(actor, "editRecords");
  const selectionRequested = Boolean(params.profile || params.apply || params.source || params.worksheet);

  return <>
    <section className="hero splitHero">
      <div>
        <p className="breadcrumb">{project ? `Projects › ${project.name}` : "Output Profiles"}</p>
        <h1>{project ? "Build Output" : "Output Profiles"}</h1>
        <p>{project ? "Apply any reusable tenant Output Profile to this Project workbook." : "Reusable master templates available across compatible Projects."}</p>
      </div>
      <span className="badge">{project ? "Project workspace" : "Reusable masters"}</span>
    </section>

    {selectionRequested && !builderData ? <UnavailableSelection /> : null}

    {builderData ? <OutputProfileBuilder
      key={`${builderData.source.id}:${builderData.draft.id ?? builderData.application?.profileId ?? "new"}`}
      source={builderData.source}
      initialDraft={builderData.draft}
      profiles={profiles}
      initialApplication={builderData.application ?? null}
      initialEffectiveDate={defaultEffectiveDate()}
      canEdit={canEdit}
      projectId={project?.id}
      projectName={project?.name}
    /> : !selectionRequested && !project && profiles.length > 0 ? <section className="card">
      <div className="sectionHeader"><div><p className="sheetLabel">Reusable library</p><h2>Saved Output Profiles</h2><p className="muted">Editing here updates the reusable master. Project applications remain separate drafts until saved as a new profile.</p></div><Link className="secondary" href="/projects">Open Projects</Link></div>
      <div className="projectProfileGrid">{profiles.map((profile) => <Link className="projectProfileCard" href={`/mapping?profile=${encodeURIComponent(profile.id)}`} key={profile.id}>
        <strong>{profile.name}</strong>
        <span>{profile.outputFormat} · {profile.outputColumnCount} columns</span>
        <small className="muted">Updated {new Date(profile.updatedAt).toLocaleDateString("en-GB")} · Originally configured from {profile.originWorkbookFileName} · {profile.originWorksheetName}</small>
      </Link>)}</div>
    </section> : !selectionRequested ? <section className="card outputProfileWelcome">
      <h2>{project ? "Open the Project workbook to build output" : "No reusable Output Profiles yet"}</h2>
      <p className="muted">{project ? "Choose a worksheet from the Project workbook before creating or applying a profile." : "Create your first Output Profile from a Project so it can be reused safely."}</p>
      <div className="actions"><Link className="primary" href={project ? `/projects/${project.id}/workbook` : "/projects"}>{project ? "Open workbook" : "Create from a Project"}</Link>{!project ? <Link className="secondary" href="/dashboard">Open Dashboard</Link> : null}</div>
    </section> : null}
  </>;
}
