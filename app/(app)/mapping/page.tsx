import Link from "next/link";
import { OutputProfileBuilder } from "@/components/data-mapper/output-profile-builder";
import { requireUser } from "@/lib/auth";
import { listOutputProfileWorkspace, loadOutputProfileBuilder } from "@/lib/data-mapper/output-profiles/repository";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { defaultEffectiveDate } from "@/lib/data-mapper/output-profiles/filename";

export const dynamic = "force-dynamic";

type MappingSearchParams = Promise<{ profile?: string; source?: string; worksheet?: string }>;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function MappingPage({ searchParams }: { searchParams: MappingSearchParams }) {
  const actor = await requireUser();
  const params = await searchParams;
  const selection = { profileId: params.profile, sourceWorkbookImportId: params.source, sourceWorksheetId: params.worksheet };
  const [workspace, builderData] = await Promise.all([
    listOutputProfileWorkspace(prisma, actor.tenantId),
    loadOutputProfileBuilder(prisma, actor.tenantId, selection)
  ]);
  const canEdit = hasPermission(actor, "editRecords");
  const selectionRequested = Boolean(params.profile || params.source || params.worksheet);
  const initialEffectiveDate = defaultEffectiveDate();
  const profilesForSelectedSource = builderData ? workspace.profiles
    .filter((profile) => profile.sourceWorkbookImportId === builderData.source.sourceWorkbookImportId)
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      sourceWorkbookImportId: profile.sourceWorkbookImportId,
      sourceWorksheetId: profile.sourceWorksheetId,
      outputFormat: profile.outputFormat
    })) : [];

  return (
    <>
      <section className="hero splitHero">
        <div>
          <p className="breadcrumb">Output Profiles</p>
          <h1>Visual Output Profile Builder</h1>
          <p>Choose a validated source sheet, then drag its headings into the output layout you want to reuse.</p>
        </div>
        <span className="badge">Draft profiles</span>
      </section>

      {selectionRequested && !builderData ? <div className="warningBox">That source worksheet or Output Profile is not available to your account.</div> : null}

      {builderData ? (
        <OutputProfileBuilder
          key={builderData.draft.id ?? builderData.source.id}
          source={builderData.source}
          initialDraft={builderData.draft}
          profiles={profilesForSelectedSource}
          initialEffectiveDate={initialEffectiveDate}
          canEdit={canEdit}
        />
      ) : (
        <section className="card outputProfileWelcome">
          <h2>Choose a source sheet</h2>
          <p className="muted">Prepare a validated workbook from Workbook Explorer, or reopen one of your saved Output Profiles below.</p>
          <div className="actions"><Link className="primary" href="/workbook">Open Workbook Explorer</Link></div>
        </section>
      )}

      <div className="outputProfileWorkspaceGrid">
        <section className="card">
          <div className="sectionHeader">
            <div><h2>Saved Output Profiles</h2><p className="muted">Reopen a draft and continue editing its layout.</p></div>
            <span className="badge">{workspace.profiles.length}</span>
          </div>
          {workspace.profiles.length > 0 ? (
            <div className="profileGrid">
              {workspace.profiles.map((profile) => (
                <Link className="profileCard tile" href={`/mapping?profile=${encodeURIComponent(profile.id)}`} key={profile.id}>
                  <strong>{profile.name}</strong>
                  <span className="muted">{profile.sourceWorkbookImport.originalFileName} · {profile.sourceWorksheet.name}</span>
                  <span className="muted">{profile.outputFormat} · {profile._count.columns} output columns · Updated {formatDate(profile.updatedAt)}</span>
                </Link>
              ))}
            </div>
          ) : <div className="emptyState"><p className="muted">No Output Profiles have been saved yet.</p></div>}
        </section>

        <section className="card">
          <div className="sectionHeader">
            <div><h2>Validated sources</h2><p className="muted">Only compact headings and three-row previews are loaded here.</p></div>
            <span className="badge">{workspace.sourceImports.length}</span>
          </div>
          {workspace.sourceImports.length > 0 ? (
            <div className="sourceImportList">
              {workspace.sourceImports.map((sourceImport) => (
                <div className="miniPanel" key={sourceImport.id}>
                  <div className="sectionHeader">
                    <div><strong>{sourceImport.originalFileName}</strong><p className="muted">Validated {formatDate(sourceImport.validatedAt)}</p></div>
                    <span className={sourceImport.validationStatus === "VALIDATED" ? "badge success" : "badge warning"}>
                      {sourceImport.validationStatus === "VALIDATED" ? "Validated" : "Validated with issues"}
                    </span>
                  </div>
                  <div className="sourceWorksheetChoices">
                    {sourceImport.worksheets.map((worksheet) => (
                      <Link className="secondary" href={`/mapping?source=${encodeURIComponent(sourceImport.id)}&worksheet=${encodeURIComponent(worksheet.id)}`} key={worksheet.id}>
                        {worksheet.name} · {worksheet.columnCount} columns
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="emptyState"><p className="muted">No workbook has been prepared for Output Profiles yet.</p></div>}
        </section>
      </div>
    </>
  );
}
