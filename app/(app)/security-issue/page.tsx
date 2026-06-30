export const dynamic = "force-dynamic";

import { createSecurityIssue } from "@/lib/actions/support.actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";

function formatDate(value: Date) {
  return value.toLocaleString("en-GB");
}

export default async function SecurityIssue({ searchParams }: { searchParams?: Promise<{ submitted?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const recentIssues = await prisma.securityIssue.findMany({
    where: { tenantId: user.tenantId, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; Support & Security</p>
        <h1>Report a security issue</h1>
        <p>Report suspected security issues separately from ordinary support tickets. Every logged-in user can use this route.</p>
      </section>

      {params?.submitted === "1" ? <p className="globalBanner">Security issue submitted. Axiom will review it separately from normal support tickets.</p> : null}

      <section className="card formCard">
        <h2>Security issue details</h2>
        <form action={createSecurityIssue as unknown as (formData: FormData) => void}>
          <label className="field"><span>Page or location</span><input name="pageUrl" placeholder="Page URL, screen name or workflow" /></label>
          <label className="field"><span>Severity</span><select name="severity" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
          <label className="field"><span>Issue description</span><textarea name="description" required /></label>
          <div className="emptyState">
            <strong>Attachments</strong>
            <p className="muted">Screenshot upload is not configured for security issue reports in this deployment yet. Add the page or location and a clear description instead.</p>
          </div>
          <SubmitButton>Submit security issue</SubmitButton>
        </form>
      </section>

      <section className="card">
        <div className="sectionHeader"><h2>Your recent security reports</h2><span className="badge">{recentIssues.length} shown</span></div>
        <table className="table">
          <thead><tr><th>Submitted</th><th>Location</th><th>Severity</th><th>Status</th></tr></thead>
          <tbody>
            {recentIssues.length === 0 ? <tr><td colSpan={4}>You have not submitted any security issues yet.</td></tr> : recentIssues.map((issue) => (
              <tr key={issue.id}>
                <td>{formatDate(issue.createdAt)}</td>
                <td>{issue.pageUrl || "Not provided"}</td>
                <td><span className="badge">{issue.severity}</span></td>
                <td>{issue.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
