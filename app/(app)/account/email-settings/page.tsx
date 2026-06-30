export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { EmailSettingsForm } from "@/components/email-settings-form";
import { ensureDefaultEmailSetup, isAxiomSenderConfigured } from "@/lib/email";

export default async function EmailSettingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, "manageCustomerSettings") || !user.tenantId) {
    return <section className="card"><h1>Email Settings</h1><p>You do not have permission to manage email settings.</p></section>;
  }
  await ensureDefaultEmailSetup(user.tenantId, user.id);
  const [setting, profiles] = await Promise.all([
    prisma.emailProviderSetting.findUnique({ where: { tenantId: user.tenantId } }),
    prisma.emailSenderProfile.findMany({ where: { tenantId: user.tenantId }, orderBy: { key: "asc" } })
  ]);
  return (
    <>
      <section className="hero"><p className="breadcrumb">Settings &gt; General Settings</p><h1>Email Settings</h1><p>Manage Axiom Email Notifications, optional customer-connected providers and standard sending profiles.</p></section>
      <EmailSettingsForm setting={setting} profiles={profiles} axiomSenderConfigured={isAxiomSenderConfigured()} />
    </>
  );
}
