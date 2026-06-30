export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export default async function AuditPage({ searchParams }: { searchParams?: Promise<{ user?: string; event?: string; module?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "viewAudit")) return <section className="card"><h1>Audit Log</h1><p>You do not have permission to view audit logs.</p></section>;
  const params = await searchParams;
  const fromDate = params?.from ? new Date(params.from) : null;
  const toDate = params?.to ? new Date(params.to) : null;
  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: user.tenantId,
      ...(params?.event ? { action: { contains: params.event, mode: "insensitive" } } : {}),
      ...(params?.module ? { entityType: { contains: params.module, mode: "insensitive" } } : {}),
      ...(params?.user ? { user: { email: { contains: params.user, mode: "insensitive" } } } : {}),
      ...(fromDate || toDate ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {})
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; General Settings</p>
        <h1>Audit Log</h1>
        <p>Review tenant-scoped activity. Customer Admins can only see audit activity for their own tenant.</p>
      </section>
      <section className="card">
        <form className="filterBar">
          <label className="field"><span>Date from</span><input type="date" name="from" defaultValue={params?.from || ""} /></label>
          <label className="field"><span>Date to</span><input type="date" name="to" defaultValue={params?.to || ""} /></label>
          <label className="field"><span>User</span><input name="user" defaultValue={params?.user || ""} placeholder="Email" /></label>
          <label className="field"><span>Event type</span><input name="event" defaultValue={params?.event || ""} placeholder="Action" /></label>
          <label className="field"><span>Module</span><input name="module" defaultValue={params?.module || ""} placeholder="Entity type" /></label>
          <button className="secondary" type="submit">Apply filters</button>
        </form>
        <table className="table"><thead><tr><th>Date</th><th>User</th><th>Event type</th><th>Module</th><th>Reason</th></tr></thead><tbody>{logs.length === 0 ? <tr><td colSpan={5}>No audit entries match these filters.</td></tr> : logs.map((log)=><tr key={log.id}><td>{log.createdAt.toLocaleString("en-GB")}</td><td>{log.user?.email || "System"}</td><td>{log.action}</td><td>{log.entityType}</td><td>{log.reason || "-"}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
