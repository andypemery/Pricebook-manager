export const dynamic = "force-dynamic";

import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { brandingConfig } from "@/config/branding.config";
import { brandingStatus, getTenantBranding } from "@/lib/branding";
import { BrandingSettingsForm } from "@/components/branding-settings-form";

export default async function BrandingSettingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, "manageCustomerSettings")) {
    return <section className="card"><h1>Branding</h1><p>You do not have permission to manage branding settings.</p></section>;
  }
  const branding = await getTenantBranding(user.tenantId);

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; General Settings</p>
        <h1>Branding</h1>
        <p>Upload customer logos used in the app header and login screen. Axiom branding remains the default when no customer logos are configured.</p>
      </section>

      <section className="card">
        <div className="sectionHeader">
          <h2>Current branding status</h2>
          <span className="badge">{brandingStatus(branding)}</span>
        </div>
        <div className="emptyState">
          <strong>Logo upload is not configured for this deployment yet.</strong>
          <p className="muted">The screen, permission checks, reset actions and server-side file validation are ready. A private file/blob storage adapter still needs to be connected before uploaded logo binaries can be stored.</p>
        </div>
      </section>

      <BrandingSettingsForm
        smallLogo={branding.smallLogo}
        fullLogo={branding.fullLogo}
        defaultSmallLogo={brandingConfig.smallLogoPath}
        defaultFullLogo={brandingConfig.fullLogoPath}
      />
    </>
  );
}
