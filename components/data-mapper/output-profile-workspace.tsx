import Link from "next/link";

type WorkspaceProfile = {
  id: string;
  name: string;
  outputFormat: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  updatedAt: Date;
  _count: { columns: number };
  sourceWorkbookImport: { originalFileName: string };
  sourceWorksheet: { name: string };
};

type WorkspaceSource = {
  id: string;
  originalFileName: string;
  validationStatus: string;
  validatedAt: Date;
  worksheets: Array<{ id: string; name: string; columnCount: number }>;
};

export type OutputProfileWorkspaceData = {
  profiles: WorkspaceProfile[];
  sourceImports: WorkspaceSource[];
};

export function profileResumeHref(profileId: string) {
  return `/mapping?profile=${encodeURIComponent(profileId)}`;
}

export function worksheetResumeHref(sourceWorkbookImportId: string, sourceWorksheetId: string) {
  return `/mapping?source=${encodeURIComponent(sourceWorkbookImportId)}&worksheet=${encodeURIComponent(sourceWorksheetId)}`;
}

export function friendlyWorkbookName(filename: string) {
  return filename.replace(/\.[^.]+$/, "") || filename;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
}

export function OutputProfileWorkspace({ workspace }: { workspace: OutputProfileWorkspaceData }) {
  const needsReviewCount = workspace.sourceImports.filter((sourceImport) => sourceImport.validationStatus !== "VALIDATED").length;
  const profileCountBySourceId = new Map<string, number>();
  for (const profile of workspace.profiles) {
    profileCountBySourceId.set(profile.sourceWorkbookImportId, (profileCountBySourceId.get(profile.sourceWorkbookImportId) ?? 0) + 1);
  }
  const profiledSourceIds = new Set(profileCountBySourceId.keys());
  const recentProfiles = workspace.profiles.slice(0, 4);
  const recentUnprofiledWorkbooks = workspace.sourceImports
    .filter((sourceImport) => !profiledSourceIds.has(sourceImport.id) && sourceImport.worksheets.length > 0)
    .slice(0, Math.max(0, 4 - recentProfiles.length));
  const visibleProfiles = workspace.profiles.slice(0, 6);
  const visibleWorkbooks = workspace.sourceImports.slice(0, 6);

  return (
    <div className="dashboardWorkspace">
      <section className="dashboardMetrics" aria-labelledby="dashboard-summary-title">
        <h2 className="visuallyHidden" id="dashboard-summary-title">At a Glance</h2>
        <div><span>Saved profiles</span><strong>{workspace.profiles.length}</strong></div>
        <div><span>Prepared workbooks</span><strong>{workspace.sourceImports.length}</strong></div>
        <div><span>Needs review</span><strong>{needsReviewCount}</strong></div>
      </section>

      <section className="dashboardSection continueWorking" aria-labelledby="continue-working-title">
        <div className="dashboardSectionHeader"><div><p className="sheetLabel">Pick up where you left off</p><h2 id="continue-working-title">Continue Working</h2></div></div>
        {recentProfiles.length > 0 || recentUnprofiledWorkbooks.length > 0 ? (
          <div className="continueWorkingGrid">
            {recentProfiles.map((profile) => (
              <article className="continueWorkCard" key={profile.id}>
                <div className="continueWorkIdentity">
                  <span className="badge">{profile.outputFormat}</span>
                  <strong title={profile.name}>{profile.name}</strong>
                  <small>Updated {formatDate(profile.updatedAt)}</small>
                </div>
                <Link className="primary" href={profileResumeHref(profile.id)} aria-label={`Continue ${profile.name}`}>Continue</Link>
              </article>
            ))}
            {recentUnprofiledWorkbooks.map((sourceImport) => {
              const firstWorksheet = sourceImport.worksheets[0];
              return (
                <article className="continueWorkCard" key={sourceImport.id}>
                  <div className="continueWorkIdentity">
                    <span className={sourceImport.validationStatus === "VALIDATED" ? "badge success" : "badge warning"}>{sourceImport.validationStatus === "VALIDATED" ? "Ready" : "Needs review"}</span>
                    <strong title={sourceImport.originalFileName}>{friendlyWorkbookName(sourceImport.originalFileName)}</strong>
                    <small>Prepared {formatDate(sourceImport.validatedAt)}</small>
                  </div>
                  <Link className="primary" href={worksheetResumeHref(sourceImport.id, firstWorksheet.id)} aria-label={`Open ${sourceImport.originalFileName}`}>Open</Link>
                </article>
              );
            })}
          </div>
        ) : <div className="emptyState"><p className="muted">Upload your first workbook to get started.</p><Link className="primary" href="/workbook">Upload workbook</Link></div>}
      </section>

      <section className="dashboardSection" aria-labelledby="saved-profiles-title">
        <div className="dashboardSectionHeader"><div><h2 id="saved-profiles-title">Saved Output Profiles</h2><p className="muted">Reusable output definitions, ready to continue.</p></div>{workspace.profiles.length > 6 ? <Link className="secondary" href="/mapping">View all profiles</Link> : null}</div>
        {visibleProfiles.length > 0 ? (
          <div className="dashboardProfileGrid">
            {visibleProfiles.map((profile) => (
              <Link className="dashboardProfileCard" href={profileResumeHref(profile.id)} key={profile.id}>
                <div><strong title={profile.name}>{profile.name}</strong><span className="badge">{profile.outputFormat}</span></div>
                <span>{profile._count.columns} output {profile._count.columns === 1 ? "column" : "columns"}</span>
                <small>Updated {formatDate(profile.updatedAt)} · <span title={profile.sourceWorkbookImport.originalFileName}>{friendlyWorkbookName(profile.sourceWorkbookImport.originalFileName)}</span></small>
              </Link>
            ))}
          </div>
        ) : <div className="emptyState"><p className="muted">No saved Output Profiles yet.</p><Link className="secondary" href="/mapping">Open Output Profiles</Link></div>}
      </section>

      <section className="dashboardSection" aria-labelledby="recent-workbooks-title">
        <div className="dashboardSectionHeader"><div><h2 id="recent-workbooks-title">Recent workbooks</h2><p className="muted">Prepared source workbooks available for output work.</p></div></div>
        {visibleWorkbooks.length > 0 ? (
          <div className="recentWorkbookList">
            {visibleWorkbooks.map((sourceImport) => {
              const firstWorksheet = sourceImport.worksheets[0];
              const profileCount = profileCountBySourceId.get(sourceImport.id) ?? 0;
              return (
                <article className="recentWorkbookRow" key={sourceImport.id}>
                  <div className="recentWorkbookIdentity">
                    <strong title={sourceImport.originalFileName}>{friendlyWorkbookName(sourceImport.originalFileName)}</strong>
                    <span>Prepared {formatDate(sourceImport.validatedAt)} · {sourceImport.worksheets.length} {sourceImport.worksheets.length === 1 ? "worksheet" : "worksheets"}{profileCount > 0 ? ` · ${profileCount} saved ${profileCount === 1 ? "profile" : "profiles"}` : ""}</span>
                  </div>
                  <span className={sourceImport.validationStatus === "VALIDATED" ? "badge success" : "badge warning"}>{sourceImport.validationStatus === "VALIDATED" ? "Ready" : "Needs review"}</span>
                  {firstWorksheet ? <Link className="secondary" href={worksheetResumeHref(sourceImport.id, firstWorksheet.id)} aria-label={`Open ${sourceImport.originalFileName}`}>Open</Link> : <span className="muted">No worksheets</span>}
                </article>
              );
            })}
          </div>
        ) : <div className="emptyState"><p className="muted">Upload your first workbook to get started.</p><Link className="primary" href="/workbook">Upload workbook</Link></div>}
      </section>
    </div>
  );
}
