export const dynamic = "force-dynamic";

import { updatePasswordPolicyAction, createGlobalMessageAction } from "@/lib/actions/admin.actions";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function GlobalSettings() {
  const user = await requireUser();
  if (!hasPermission(user, "manageCustomerSettings")) return <section className="card"><h1>Global Settings</h1><p>You do not have permission to manage customer settings.</p></section>;
  const [passwordPolicy, messages, tenantSettings] = await Promise.all([
    prisma.passwordPolicy.findUnique({ where: { tenantId: user.tenantId } }),
    prisma.globalMessage.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.tenantSetting.findMany({ where: { tenantId: user.tenantId }, orderBy: { key: "asc" }, take: 20 })
  ]);

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; General Settings</p>
        <h1>Global Settings</h1>
        <p>Manage customer-configurable settings. Axiom-controlled technical and commercial controls are kept separate.</p>
      </section>

      <section className="card">
        <div className="grid">
          <div className="miniPanel"><span className="labelText">Password length</span><strong>{passwordPolicy?.minLength || 8} characters</strong></div>
          <div className="miniPanel"><span className="labelText">Special character</span><strong>{passwordPolicy?.requireSpecial ? "Required" : "Not required"}</strong></div>
          <div className="miniPanel"><span className="labelText">Axiom controls</span><strong>Restricted</strong></div>
        </div>
      </section>

      <section className="card formCard">
        <h2>Password policy</h2>
        <form action={updatePasswordPolicyAction as unknown as (formData: FormData) => void}>
          <label className="field"><span>Minimum length</span><input type="number" name="minLength" min="8" defaultValue={passwordPolicy?.minLength || 8} /></label>
          <label className="checkboxLine"><input type="checkbox" name="requireSpecial" defaultChecked={passwordPolicy?.requireSpecial || false} /> Require special character</label>
          <label className="field"><span>Confirm current password</span><input name="reauthPassword" type="password" autoComplete="current-password" required /></label>
          <SubmitButton>Save password policy</SubmitButton>
        </form>
      </section>

      <section className="card formCard">
        <h2>Customer message</h2>
        <p className="muted">Publish a customer-scoped banner message for logged-in users.</p>
        <form action={createGlobalMessageAction as unknown as (formData: FormData) => void}>
          <label className="field"><span>Message</span><input name="message" required /></label>
          <label className="field"><span>Hours, 1 to 72</span><input name="hours" type="number" min="1" max="72" defaultValue="24" /></label>
          <label className="checkboxLine"><input type="checkbox" name="untilAcknowledged" /> Until acknowledged</label>
          <SubmitButton>Publish message</SubmitButton>
        </form>
      </section>

      <section className="card">
        <div className="sectionHeader"><h2>Recent customer messages</h2><span className="badge">{messages.length} shown</span></div>
        <table className="table">
          <thead><tr><th>Message</th><th>Starts</th><th>Ends</th><th>Status</th></tr></thead>
          <tbody>
            {messages.length === 0 ? <tr><td colSpan={4}>No customer messages have been published yet.</td></tr> : messages.map((message) => (
              <tr key={message.id}><td>{message.message}</td><td>{message.startsAt.toLocaleString("en-GB")}</td><td>{message.endsAt?.toLocaleString("en-GB") || "Until acknowledged"}</td><td><span className="badge">{message.isActive ? "Active" : "Inactive"}</span></td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="sectionHeader"><h2>Configured tenant settings</h2><span className="badge">{tenantSettings.length} shown</span></div>
        <table className="table">
          <thead><tr><th>Setting</th><th>Status</th></tr></thead>
          <tbody>
            {tenantSettings.length === 0 ? <tr><td colSpan={2}>No additional tenant settings are configured yet.</td></tr> : tenantSettings.map((setting) => (
              <tr key={setting.id}><td>{setting.key}</td><td><span className="badge">Configured</span></td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
