import Link from "next/link";
import { OutputProfileBuilder } from "@/components/data-mapper/output-profile-builder";
import { requireUser } from "@/lib/auth";
import { listReusableOutputProfiles, loadOutputProfileBuilder } from "@/lib/data-mapper/output-profiles/repository";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { defaultEffectiveDate } from "@/lib/data-mapper/output-profiles/filename";

export const dynamic = "force-dynamic";

type MappingSearchParams = Promise<{ profile?: string; apply?: string; source?: string; worksheet?: string }>;

export default async function MappingPage({ searchParams }: { searchParams: MappingSearchParams }) {
  const actor = await requireUser();
  const params = await searchParams;
  const selection = { profileId: params.profile, applyProfileId: params.apply, sourceWorkbookImportId: params.source, sourceWorksheetId: params.worksheet };
  const [profiles, builderData] = await Promise.all([
    listReusableOutputProfiles(prisma, actor.tenantId),
    loadOutputProfileBuilder(prisma, actor.tenantId, selection)
  ]);
  const canEdit = hasPermission(actor, "editRecords");
  const selectionRequested = Boolean(params.profile || params.apply || params.source || params.worksheet);
  const initialEffectiveDate = defaultEffectiveDate();

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
          key={`${builderData.source.id}:${builderData.draft.id ?? builderData.application?.profileId ?? "new"}`}
          source={builderData.source}
          initialDraft={builderData.draft}
          profiles={profiles}
          initialApplication={builderData.application ?? null}
          initialEffectiveDate={initialEffectiveDate}
          canEdit={canEdit}
        />
      ) : (
        <section className="card outputProfileWelcome">
          <h2>Choose a workbook to build or apply an Output Profile</h2>
          <p className="muted">Select a validated workbook and worksheet from the Dashboard or continue through Workbook Explorer.</p>
          <div className="actions">
            <Link className="primary" href="/dashboard">Open Dashboard</Link>
            <Link className="secondary" href="/workbook">Open Workbook Explorer</Link>
          </div>
        </section>
      )}
    </>
  );
}
