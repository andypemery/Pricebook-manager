export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createUserAction } from "@/lib/actions/admin.actions";
import { SubmitButton } from "@/components/submit-button";

export default async function NewUserPage() {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return <section className="card"><h1>Not allowed</h1><p>You do not have permission to manage users.</p></section>;

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Account › Users & Permissions › Add user</p>
        <h1>Add user</h1>
        <p>The user will receive a 24-hour invite link and will set their own password.</p>
      </section>
      <section className="card narrowCard">
        <form action={createUserAction as unknown as (formData: FormData) => void} className="grid">
          <label className="field"><span>Email address</span><input name="email" type="email" required /></label>
          <label className="field"><span>First name</span><input name="firstName" required /></label>
          <label className="field"><span>Surname</span><input name="surname" required /></label>
          <label className="field"><span>Role template</span><select name="role"><option value="VIEW_ONLY">View Only</option><option value="SUPER_USER">Super User</option><option value="CUSTOMER_ADMIN">Admin</option></select></label>
          <div className="actions"><SubmitButton>Send invite</SubmitButton><Link className="secondary" href="/admin/users">Cancel</Link></div>
        </form>
      </section>
    </>
  );
}
