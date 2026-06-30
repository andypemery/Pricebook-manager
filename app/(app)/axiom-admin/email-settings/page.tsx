export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireAxiomAdmin } from "@/lib/auth";
import { axiomForceEmailFallbackAction, axiomTestTenantEmailAction } from "@/lib/actions/email.actions";
import { SubmitButton } from "@/components/submit-button";
import { backfillDefaultEmailSetup, isAxiomSenderConfigured } from "@/lib/email";

function formatDate(value?: Date | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-GB");
}

export default async function AxiomEmailSettingsPage() {
  const actor = await requireAxiomAdmin();
  await backfillDefaultEmailSetup(actor.id);
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    include: { emailProviderSetting: true, emailSendLogs: { orderBy: { createdAt: "desc" }, take: 3 } }
  });
  const axiomStatus = isAxiomSenderConfigured() ? "Active" : "Needs Axiom setup";
  return (
    <>
      <section className="hero"><p className="breadcrumb">Axiom Admin &gt; Email Settings</p><h1>Email provider overview</h1><p>Review customer email provider status, test sending and force fallback to the Axiom sender where needed.</p><p className="badge">Axiom Email Notifications: {axiomStatus}</p></section>
      <section className="card">
        <table className="table">
          <thead><tr><th>Tenant</th><th>Provider</th><th>Status</th><th>Last successful send</th><th>Last failed send</th><th>Actions</th></tr></thead>
          <tbody>
            {tenants.map((tenant) => {
              const setting = tenant.emailProviderSetting;
              return (
                <tr key={tenant.id}>
                  <td>{tenant.name}</td>
                  <td>{setting?.mode.replace("MICROSOFT_GRAPH", "Microsoft 365") || "Axiom default"}</td>
                  <td><span className="badge">{setting?.customerSendingDisabled ? "Fallback forced" : setting?.status || "Default"}</span></td>
                  <td>{formatDate(setting?.lastSuccessfulSendAt)}</td>
                  <td>{formatDate(setting?.lastFailedSendAt)}</td>
                  <td className="tableActions">
                    <form action={axiomTestTenantEmailAction as unknown as (formData: FormData) => void} className="miniForm">
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input name="testRecipient" type="email" placeholder="test@example.com" aria-label={`Test recipient for ${tenant.name}`} />
                      <button className="linkButton" type="submit">Test</button>
                    </form>
                    <form action={axiomForceEmailFallbackAction as unknown as (formData: FormData) => void}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <SubmitButton>Force fallback</SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
