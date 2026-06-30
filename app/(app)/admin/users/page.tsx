export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resendUserInviteAction } from "@/lib/actions/admin.actions";
import { hasPermission } from "@/lib/permissions";

const pageSize = 20;

function roleLabel(role: string) {
  if (role === "CUSTOMER_ADMIN") return "Admin";
  if (role === "SUPER_USER") return "Super User";
  if (role === "VIEW_ONLY") return "View Only";
  return "Axiom Admin";
}

export default async function Users({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const actor = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page || 1));
  const where = { tenantId: actor.tenantId };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { userInvites: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.user.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canManage = hasPermission(actor, "manageCustomerUsers");

  return (
    <>
      <section className="hero splitHero">
        <div>
          <p className="breadcrumb">Account › Users & Permissions</p>
          <h1>Users & Permissions</h1>
          <p>Manage user access. New users receive a 24-hour invite link and set their own password.</p>
        </div>
        {canManage ? (
          <div className="actions">
            <Link className="primary" href="/admin/users/new">Add user</Link>
            <Link className="secondary" href="/admin/users/import">Import users</Link>
            <a className="secondary" href="/api/users/import-template">Download import template</a>
          </div>
        ) : null}
      </section>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const latestInvite = user.userInvites[0];
              const pending = !user.isActive || !user.passwordHash;
              const expired = latestInvite ? latestInvite.expiresAt < new Date() : false;
              return (
                <tr key={user.id}>
                  <td>{user.firstName} {user.surname}</td>
                  <td>{user.email}</td>
                  <td>{roleLabel(user.role)}</td>
                  <td><span className="badge">{pending ? expired ? "Invite expired" : "Invite pending" : "Active"}</span></td>
                  <td>
                    {pending && canManage ? (
                      <form action={resendUserInviteAction as unknown as (formData: FormData) => void}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button className="linkButton" type="submit">Resend invite</button>
                      </form>
                    ) : <span className="muted">No action</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pagination">
          <span>Rows per page <strong>20</strong></span>
          <span>Showing {total === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}</span>
          <div className="pageControls">
            <Link className={page <= 1 ? "pageButton disabled" : "pageButton"} href={`/admin/users?page=${Math.max(1, page - 1)}`}>Previous</Link>
            <span className="pageButton current">{page}</span>
            <span>of {totalPages}</span>
            <Link className={page >= totalPages ? "pageButton disabled" : "pageButton"} href={`/admin/users?page=${Math.min(totalPages, page + 1)}`}>Next</Link>
          </div>
        </div>
      </section>
    </>
  );
}
