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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function OutputProfileWorkspace({ workspace }: { workspace: OutputProfileWorkspaceData }) {
  return (
    <div className="outputProfileWorkspaceGrid">
      <section className="card outputWorkspaceCard">
        <div className="sectionHeader">
          <div><h2>Saved Output Profiles</h2><p className="muted">Select a profile to reopen its source, worksheet and saved layout.</p></div>
          <span className="badge">{workspace.profiles.length}</span>
        </div>
        {workspace.profiles.length > 0 ? (
          <div className="profileGrid">
            {workspace.profiles.map((profile) => (
              <Link className="profileCard tile" href={profileResumeHref(profile.id)} key={profile.id}>
                <strong>{profile.name}</strong>
                <span className="muted workspaceFilename" title={profile.sourceWorkbookImport.originalFileName}>{profile.sourceWorkbookImport.originalFileName} · {profile.sourceWorksheet.name}</span>
                <span className="muted">{profile.outputFormat} · {profile._count.columns} output columns · Updated {formatDate(profile.updatedAt)}</span>
              </Link>
            ))}
          </div>
        ) : <div className="emptyState"><p className="muted">No Output Profiles have been saved yet.</p></div>}
      </section>

      <section className="card outputWorkspaceCard">
        <div className="sectionHeader">
          <div><h2>Validated Sources</h2><p className="muted">Open a worksheet to continue its Output Profile workflow. Only compact headings and three sample rows are loaded.</p></div>
          <span className="badge">{workspace.sourceImports.length}</span>
        </div>
        {workspace.sourceImports.length > 0 ? (
          <div className="sourceImportList">
            {workspace.sourceImports.map((sourceImport) => {
              const firstWorksheet = sourceImport.worksheets[0];
              const profiles = workspace.profiles.filter((profile) => profile.sourceWorkbookImportId === sourceImport.id);
              return (
                <article className="miniPanel sourceImportPanel" key={sourceImport.id}>
                  <div className="sectionHeader sourceImportHeader">
                    <div className="sourceImportIdentity">
                      {firstWorksheet ? (
                        <Link className="sourceWorkbookLink" href={worksheetResumeHref(sourceImport.id, firstWorksheet.id)} title={sourceImport.originalFileName}>
                          {sourceImport.originalFileName}
                        </Link>
                      ) : <strong className="workspaceFilename" title={sourceImport.originalFileName}>{sourceImport.originalFileName}</strong>}
                      <p className="muted">Validated {formatDate(sourceImport.validatedAt)}</p>
                    </div>
                    <span className={sourceImport.validationStatus === "VALIDATED" ? "badge success" : "badge warning"}>
                      {sourceImport.validationStatus === "VALIDATED" ? "Validated" : "Validated with issues"}
                    </span>
                  </div>
                  <div className="sourceWorksheetChoices">
                    {sourceImport.worksheets.map((worksheet) => {
                      const worksheetProfiles = profiles.filter((profile) => profile.sourceWorksheetId === worksheet.id);
                      return (
                        <div className="sourceWorksheetChoice" key={worksheet.id}>
                          <Link className="secondary" href={worksheetResumeHref(sourceImport.id, worksheet.id)} title={`${worksheet.name} · ${worksheet.columnCount} columns`}>
                            {worksheet.name} · {worksheet.columnCount} columns
                          </Link>
                          {worksheetProfiles.map((profile) => (
                            <Link className="workspaceResumeLink" href={profileResumeHref(profile.id)} key={profile.id}>Resume {profile.name}</Link>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="emptyState"><p className="muted">No workbook has been prepared for Output Profiles yet.</p></div>}
      </section>
    </div>
  );
}
