export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

function requestTypeLabel(value: string) {
  const labels: Record<string, string> = {
    SAR: "Subject Access Request",
    ERASURE: "Erasure",
    RECTIFICATION: "Rectification",
    RESTRICTION: "Restriction",
    PORTABILITY: "Portability",
    OBJECTION: "Objection",
    CONSENT_WITHDRAWAL: "Consent withdrawal"
  };
  return labels[value] || value;
}

export default async function DataRightsPage({ searchParams }: { searchParams?: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "manageDataRights")) return <section className="card"><h1>Data Rights</h1><p>You do not have permission to manage data rights requests.</p></section>;
  const params = await searchParams;
  const status = params?.status || "";
  const q = params?.q?.trim() || "";
  const [requests, registerItems] = await Promise.all([
    prisma.dataSubjectRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status: status as never } : {}),
        ...(q ? { OR: [{ requesterName: { contains: q, mode: "insensitive" } }, { requesterEmail: { contains: q, mode: "insensitive" } }] } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.dataRegisterItem.findMany({ where: { tenantId: user.tenantId }, orderBy: { moduleName: "asc" }, take: 20 })
  ]);

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; GDPR Features</p>
        <h1>Data Rights</h1>
        <p>The Data Rights area helps customer admins manage requests from people about their personal data. This includes Subject Access Requests, erasure requests, rectification requests, restriction requests, portability requests, objections and consent withdrawal. It gives the customer a structured place to record the request, track progress, assign an owner, record notes and keep an audit trail.</p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>How to use this section</h2>
          <ul className="helpList">
            <li>Record new data subject requests as soon as they are received.</li>
            <li>Choose the correct request type, such as Subject Access Request, Erasure, Rectification, Restriction, Portability, Objection or Consent Withdrawal.</li>
            <li>Add the person/requestor details.</li>
            <li>Assign an owner.</li>
            <li>Track status and due date.</li>
            <li>Add notes and updates as the request progresses.</li>
            <li>Use the audit/history area to show what happened and when.</li>
            <li>Use guided review steps for erasure/deletion rather than a simple one-click delete.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Why this matters</h2>
          <ul className="helpList">
            <li>UK GDPR gives people rights over their personal data.</li>
            <li>Customers need a structured way to record, review and respond to requests.</li>
            <li>Subject Access Requests are also known as SARs.</li>
            <li>These requests should not be called FOI requests unless the app is specifically for a public authority Freedom of Information process.</li>
            <li>Tracking status, owner, due date and notes helps customers manage deadlines and accountability.</li>
            <li>Important actions should be audit logged where practical.</li>
          </ul>
        </div>
      </section>

      <section className="card">
        <div className="sectionHeader"><h2>Data Subject Requests</h2><span className="badge">{requests.length} shown</span></div>
        <form className="filterBar">
          <label className="field"><span>Person search</span><input name="q" defaultValue={q} placeholder="Name or email" /></label>
          <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="NEW">New</option><option value="VERIFYING">Verifying</option><option value="UNDER_REVIEW">Under review</option><option value="AWAITING_APPROVAL">Awaiting approval</option><option value="COMPLETED">Completed</option><option value="REJECTED">Rejected</option></select></label>
          <button className="secondary" type="submit">Apply filters</button>
        </form>
        <table className="table">
          <thead><tr><th>Created</th><th>Request type</th><th>Person</th><th>Status</th><th>Owner</th><th>Target date</th><th>Notes/history</th><th>Actions</th></tr></thead>
          <tbody>
            {requests.length === 0 ? <tr><td colSpan={8}>No Data Subject Requests exist yet.</td></tr> : requests.map((request) => (
              <tr key={request.id}>
                <td>{request.createdAt.toLocaleDateString("en-GB")}</td>
                <td>{requestTypeLabel(request.requestType)}</td>
                <td>{request.requesterName}<br /><span className="muted">{request.requesterEmail}</span></td>
                <td><span className="badge">{request.status.replaceAll("_", " ")}</span></td>
                <td><span className="muted">Not assigned yet</span></td>
                <td><span className="muted">Set during review</span></td>
                <td>{request.decisionNotes || <span className="muted">No notes recorded</span>}</td>
                <td><span className="muted">Guided review only</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Create new request</h2>
        <div className="emptyState">
          <strong>Guided request creation is not wired for this deployment yet.</strong>
          <p className="muted">The standard layout is ready for Subject Access Request, erasure, rectification, restriction, portability, objection and consent withdrawal workflows. Permanent deletion is intentionally not exposed as a one-click action.</p>
        </div>
      </section>

      <section className="card">
        <div className="sectionHeader"><h2>Data register coverage</h2><span className="badge">{registerItems.length} shown</span></div>
        <table className="table">
          <thead><tr><th>Module</th><th>Data category</th><th>Purpose</th><th>Lawful basis</th><th>Retention</th><th>Sensitivity</th><th>SAR</th><th>Erasure</th></tr></thead>
          <tbody>
            {registerItems.length === 0 ? <tr><td colSpan={8}>No data register items have been configured yet.</td></tr> : registerItems.map((item) => (
              <tr key={item.id}>
                <td>{item.moduleName}</td>
                <td>{item.dataCategory}</td>
                <td>{item.purpose}</td>
                <td>{item.lawfulBasis}</td>
                <td>{item.retentionPeriod}</td>
                <td>{item.sensitivityLevel}</td>
                <td>{item.includeInSar ? "Included" : "Excluded"}</td>
                <td>{item.canErase ? "Review allowed" : "Axiom review required"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
