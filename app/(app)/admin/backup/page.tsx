export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireAxiomAdmin } from "@/lib/auth";

export default async function BackupPage() {
  const user = await requireAxiomAdmin();
  const rows = await prisma.backupStatus.findMany({ where: { tenantId: user.tenantId }, orderBy: { backupType: "asc" } });
  const database = rows.find((row) => row.backupType.toLowerCase().includes("database"));
  const fileBackup = rows.find((row) => row.backupType.toLowerCase().includes("file") || row.backupType.toLowerCase().includes("blob"));
  const verification = rows.find((row) => row.latestVerifiedRestorePoint || row.verificationStatus);
  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; General Settings</p>
        <h1>Backup Status</h1>
        <p>Axiom Admin-only status view. Customers do not run backup or restore controls directly.</p>
      </section>
      <section className="grid">
        <div className="card"><h2>Database backup</h2><p className="badge">{database?.status || "Not configured"}</p><p className="muted">Last completed: {database?.lastCompletedAt?.toLocaleString("en-GB") || "Not recorded"}</p></div>
        <div className="card"><h2>File/blob backup</h2><p className="badge">{fileBackup?.status || "Not configured"}</p><p className="muted">{fileBackup ? `Retention: ${fileBackup.restoreRetentionDays} days` : "Private storage backup is not wired for this deployment yet."}</p></div>
        <div className="card"><h2>Last verification</h2><p className="badge">{verification?.verificationStatus || "Not yet implemented"}</p><p className="muted">{verification?.latestVerifiedRestorePoint?.toLocaleString("en-GB") || "No verified restore point has been recorded."}</p></div>
      </section>
      <section className="card">
        <table className="table"><thead><tr><th>Type</th><th>Status</th><th>Retention</th><th>Last completed</th><th>Verification</th><th>Location reference</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6}>No backup status records exist yet. Backup monitoring is not configured for this deployment.</td></tr> : rows.map((row)=><tr key={row.id}><td>{row.backupType}</td><td><span className="badge">{row.status}</span></td><td>{row.restoreRetentionDays} days</td><td>{row.lastCompletedAt?.toLocaleString("en-GB") || "Not recorded"}</td><td>{row.verificationStatus || "Not configured"}</td><td>{row.locationReference ? "Reference recorded" : "Not exposed"}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
