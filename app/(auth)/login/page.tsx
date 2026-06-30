export const dynamic = "force-dynamic";

import { brandingConfig } from "@/config/branding.config";
import { getSingleTenantLoginBranding, loginLogoPath } from "@/lib/branding";
import { LoginForm } from "@/components/login-form";

export default async function Login({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const params = await searchParams;
  const branding = await getSingleTenantLoginBranding();
  const logoPath = loginLogoPath(branding);

  return (
    <div className="loginWrap">
      <LoginForm logoPath={logoPath} title={brandingConfig.appDisplayName} inviteAccepted={params.invite === "accepted"} />
    </div>
  );
}
