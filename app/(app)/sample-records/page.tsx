export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const pageSize = 20;

export default async function Records({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page || 1));
  const where = { tenantId: user.tenantId, archivedAt: null };
  const [records, total] = await Promise.all([
    prisma.sampleRecord.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.sampleRecord.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section className="card">
      <div className="actions">
        <div>
          <h1>Demo Records</h1>
          <p className="muted">This is a base-app demo module only. Replace or remove it before creating a real customer app.</p>
        </div>
        <Link className="primary" href="/sample-records/new">Add demo record</Link>
      </div>
      <table className="table">
        <thead><tr><th>Subject</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}><td><Link href={`/sample-records/${record.id}`}>{record.title}</Link></td><td>{record.status}</td><td>{new Date(record.updatedAt).toLocaleDateString("en-GB")}</td></tr>)}</tbody>
      </table>
      <div className="pagination">
        <span>Rows per page <strong>20</strong></span>
        <span>Showing {total === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}</span>
        <div className="pageControls">
          <Link className={page <= 1 ? "pageButton disabled" : "pageButton"} href={`/sample-records?page=${Math.max(1, page - 1)}`}>Previous</Link>
          <span className="pageButton current">{page}</span><span>of {totalPages}</span>
          <Link className={page >= totalPages ? "pageButton disabled" : "pageButton"} href={`/sample-records?page=${Math.min(totalPages, page + 1)}`}>Next</Link>
        </div>
      </div>
    </section>
  );
}
