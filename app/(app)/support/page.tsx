export const dynamic = "force-dynamic";

import { createSupportTicket } from "@/lib/actions/support.actions";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";

function formatDate(value: Date) {
  return value.toLocaleString("en-GB");
}

export default async function Support({ searchParams }: { searchParams?: Promise<{ status?: string; q?: string; submitted?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const canUseSupport = hasPermission(user, "raiseSupportTickets");
  if (!canUseSupport) {
    return <section className="card"><h1>Support</h1><p>You do not have permission to raise or view support tickets.</p></section>;
  }

  const status = params?.status || "";
  const q = params?.q?.trim() || "";
  const tickets = await prisma.supportTicket.findMany({
    where: {
      tenantId: user.tenantId,
      ...(status ? { status: status as never } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { affectedArea: { contains: q, mode: "insensitive" } }] } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; Support & Security</p>
        <h1>Support</h1>
        <p>Raise support requests and review recent tickets for your customer account. Support tickets do not use priority by default.</p>
      </section>

      {params?.submitted === "1" ? <p className="globalBanner">Support request submitted.</p> : null}

      <section className="card">
        <div className="sectionHeader">
          <h2>Support tickets</h2>
          <span className="badge">{tickets.length} shown</span>
        </div>
        <form className="filterBar">
          <label className="field"><span>Search</span><input name="q" defaultValue={q} placeholder="Title or affected area" /></label>
          <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="NEW">New</option><option value="TRIAGE">Triage</option><option value="WAITING_FOR_CUSTOMER">Waiting for customer</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label>
          <button className="secondary" type="submit">Apply filters</button>
        </form>
        <table className="table">
          <thead><tr><th>Created</th><th>Title</th><th>Type</th><th>Affected area</th><th>Status</th></tr></thead>
          <tbody>
            {tickets.length === 0 ? <tr><td colSpan={5}>No support tickets match these filters.</td></tr> : tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>{formatDate(ticket.createdAt)}</td>
                <td>{ticket.title}</td>
                <td>{ticket.ticketType}</td>
                <td>{ticket.affectedArea || "General"}</td>
                <td><span className="badge">{ticket.status.replaceAll("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card formCard">
        <h2>Create support ticket</h2>
        <p className="muted">Include enough detail for Axiom support to understand the issue. Do not include sensitive data unless it is genuinely needed.</p>
        <form action={createSupportTicket as unknown as (formData: FormData) => void}>
          <label className="field"><span>Title</span><input name="title" required /></label>
          <label className="field"><span>Ticket type</span><select name="ticketType"><option>Issue</option><option>Question</option><option>Login/access issue</option><option>Bug</option></select></label>
          <label className="field"><span>Affected area</span><input name="affectedArea" placeholder="Page, module or workflow" /></label>
          <label className="field"><span>Description</span><textarea name="description" required /></label>
          <SubmitButton>Submit support request</SubmitButton>
        </form>
      </section>
    </>
  );
}
