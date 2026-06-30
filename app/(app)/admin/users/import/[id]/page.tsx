export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { confirmUserImportAction } from "@/lib/actions/admin.actions";
import { SubmitButton } from "@/components/submit-button";

export default async function ImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return <section className="card"><h1>Not allowed</h1><p>You do not have permission to import users.</p></section>;
  const { id } = await params;
  const batch = await prisma.userImportBatch.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { rows: { orderBy: { rowNumber: "asc" } } }
  });
  if (!batch) return <section className="card"><h1>Import not found</h1><p>This import preview could not be found.</p></section>;
  const validRows = batch.rows.filter((row) => row.isValid);
  const skippedRows = batch.rows.filter((row) => !row.isValid);
  const completed = batch.status === "COMPLETED";

  return (
    <>
      <section className="hero splitHero">
        <div>
          <p className="breadcrumb">Account › Users & Permissions › Import preview</p>
          <h1>{completed ? "Import results" : "Import preview"}</h1>
          <p>{batch.fileName}</p>
        </div>
        <div className="actions"><Link className="secondary" href="/admin/users">Back to users</Link></div>
      </section>

      <section className="card summaryGrid">
        <div><strong>{validRows.length}</strong><span>Valid rows</span></div>
        <div><strong>{skippedRows.length}</strong><span>Skipped rows</span></div>
        <div><strong>{batch.importedCount}</strong><span>Imported</span></div>
        <div><strong>{batch.inviteSentCount}</strong><span>Invite emails sent</span></div>
      </section>

      {!completed ? (
        <section className="card">
          <h2>Confirm import</h2>
          <p>When you confirm, valid users will be created and one invite email will be sent to each valid user immediately. Skipped rows will not be imported.</p>
          <form action={confirmUserImportAction as unknown as (formData: FormData) => void}>
            <input type="hidden" name="batchId" value={batch.id} />
            <SubmitButton>Confirm import and send invites</SubmitButton>
          </form>
        </section>
      ) : null}

      <section className="card">
        <h2>Valid rows</h2>
        <table className="table">
          <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{validRows.map((row) => <tr key={row.id}><td>{row.rowNumber}</td><td>{row.firstName} {row.surname}</td><td>{row.email}</td><td>{row.roleLabel}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="card">
        <div className="actions"><h2>Skipped rows</h2>{skippedRows.length ? <a className="secondary" href={`/api/users/import-skipped/${batch.id}`}>Download skipped rows</a> : null}</div>
        {skippedRows.length ? (
          <table className="table">
            <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Role</th><th>Reason</th></tr></thead>
            <tbody>{skippedRows.map((row) => <tr key={row.id}><td>{row.rowNumber}</td><td>{row.firstName} {row.surname}</td><td>{row.email}</td><td>{row.roleLabel}</td><td>{row.error}</td></tr>)}</tbody>
          </table>
        ) : <p className="muted">No skipped rows.</p>}
      </section>
    </>
  );
}
