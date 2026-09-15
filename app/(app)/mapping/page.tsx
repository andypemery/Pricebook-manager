import Link from "next/link";
import { OutputProfileBuilder } from "@/components/data-mapper/output-profile-builder";
import { OutputProfileWorkspace } from "@/components/data-mapper/output-profile-workspace";
import { requireUser } from "@/lib/auth";
import { listOutputProfileWorkspace, loadOutputProfileBuilder } from "@/lib/data-mapper/output-profiles/repository";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { defaultEffectiveDate } from "@/lib/data-mapper/output-profiles/filename";

export const dynamic = "force-dynamic";

type MappingSearchParams = Promise<{ profile?: string; source?: string; worksheet?: string }>;

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

      <OutputProfileWorkspace workspace={workspace} />
    </>
  );
}
