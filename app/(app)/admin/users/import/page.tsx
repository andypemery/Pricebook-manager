export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { previewUserImportAction } from "@/lib/actions/admin.actions";
import { SubmitButton } from "@/components/submit-button";

export default async function ImportUsersPage() {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return <section className="card"><h1>Not allowed</h1><p>You do not have permission to import users.</p></section>;
  return (
    <>
      <section className="hero splitHero">
        <div>
          <p className="breadcrumb">Account › Users & Permissions › Import users</p>
          <h1>Import users</h1>
          <p>Upload the Excel template, preview valid and skipped rows, then confirm to import and send invites.</p>
        </div>
        <a className="secondary" href="/api/users/import-template">Download import template</a>
      </section>
      <section className="card narrowCard">
        <form action={previewUserImportAction as unknown as (formData: FormData) => void} className="grid">
          <label className="field"><span>Completed Excel file</span><input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
          <p className="muted">Valid users will be created and invite emails will be sent immediately after you confirm the preview. Bad rows and duplicate email addresses will be skipped and reported.</p>
          <div className="actions"><SubmitButton>Preview import</SubmitButton><Link className="secondary" href="/admin/users">Cancel</Link></div>
        </form>
      </section>
    </>
  );
}
