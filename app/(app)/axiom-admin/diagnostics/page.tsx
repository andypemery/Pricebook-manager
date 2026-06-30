export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAxiomAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import packageJson from "@/package.json";
import { ensureDefaultEmailSetup, isAxiomSenderConfigured } from "@/lib/email";

export default async function DiagnosticsPage() {
  const user = await requireAxiomAdmin();
  await ensureDefaultEmailSetup(user.tenantId, user.id);
  const [tenant, emailSetting, backupCount, recentLogs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
    prisma.emailProviderSetting.findUnique({ where: { tenantId: user.tenantId } }),
    prisma.backupStatus.count({ where: { tenantId: user.tenantId } }),
    prisma.emailSendLog.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 5 })
  ]);
  const databaseStatus = tenant ? "Connected" : "Needs attention";
  const deploymentReference = process.env.VERCEL_GIT_COMMIT_SHA ? "Recorded" : "Not recorded";
  const axiomEmailStatus = isAxiomSenderConfigured() ? "Active" : "Needs Axiom setup";

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; General Settings</p>
        <h1>Axiom Admin diagnostics</h1>
        <p>Safe diagnostic information for Axiom Admins only. Secrets, tokens and raw connection strings are not shown.</p>
      </section>

      <section className="grid">
        <div className="card"><h2>App version</h2><p className="badge">{packageJson.version}</p><p className="muted">Standard Base App package version.</p></div>
        <div className="card"><h2>Environment</h2><p className="badge">{process.env.NODE_ENV === "production" ? "Production" : "Non-production"}</p><p className="muted">No environment variable values are exposed.</p></div>
        <div className="card"><h2>Deployment reference</h2><p className="badge">{deploymentReference}</p><p className="muted">Build reference is shown only as availability, not as a raw value.</p></div>
        <div className="card"><h2>Database connectivity</h2><p className="badge">{databaseStatus}</p><p className="muted">{tenant?.name || "Tenant lookup failed."}</p></div>
        <div className="card"><h2>Email provider</h2><p className="badge">{emailSetting?.mode === "AXIOM" ? axiomEmailStatus : emailSetting?.status || "Axiom default"}</p><p className="muted">{emailSetting?.mode?.replace("MICROSOFT_GRAPH", "Microsoft 365") || "Axiom Email Notifications fallback."}</p></div>
        <div className="card"><h2>Storage provider</h2><p className="badge">Not configured yet</p><p className="muted">No private storage health check is wired for this deployment.</p></div>
        <div className="card"><h2>Backup checks</h2><p className="badge">{backupCount ? `${backupCount} records` : "Not configured yet"}</p><p className="muted">Backup status is recorded separately from restore controls.</p></div>
      </section>

      <section className="card">
        <div className="sectionHeader"><h2>Recent email health checks</h2><Link className="secondary" href="/axiom-admin/email-settings">Email settings</Link></div>
        <table className="table">
          <thead><tr><th>Date</th><th>Provider</th><th>Event</th><th>Status</th><th>Message</th></tr></thead>
          <tbody>
            {recentLogs.length === 0 ? <tr><td colSpan={5}>No recent email health checks or send logs exist yet.</td></tr> : recentLogs.map((log) => (
              <tr key={log.id}><td>{log.createdAt.toLocaleString("en-GB")}</td><td>{log.providerMode.replace("MICROSOFT_GRAPH", "Microsoft 365")}</td><td>{log.eventType}</td><td><span className="badge">{log.success ? "Passed" : "Needs attention"}</span></td><td>{log.safeMessage || "-"}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
