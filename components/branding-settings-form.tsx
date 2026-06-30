"use client";

import Image from "next/image";
import { useActionState } from "react";
import { resetBrandingLogoAction, uploadBrandingLogoAction } from "@/lib/actions/branding.actions";
import { SubmitButton } from "@/components/submit-button";
import type { BrandingLogo } from "@/lib/branding";

type ActionState = { success?: string; error?: string };

async function uploadReducer(_state: ActionState, formData: FormData): Promise<ActionState> {
  return uploadBrandingLogoAction(formData);
}

async function resetReducer(_state: ActionState, formData: FormData): Promise<ActionState> {
  return resetBrandingLogoAction(formData);
}

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-GB");
}

function LogoPanel({ slot, title, description, logo, fallbackPath }: { slot: "smallLogo" | "fullLogo"; title: string; description: string; logo?: BrandingLogo | null; fallbackPath: string }) {
  const [uploadState, uploadAction] = useActionState(uploadReducer, {});
  const [resetState, resetAction] = useActionState(resetReducer, {});
  const activePath = logo?.url || fallbackPath;
  const previewClass = slot === "smallLogo" ? "logoPreview smallLogoPreview" : "logoPreview fullLogoPreview";

  return (
    <section className="card formCard">
      <div className="sectionHeader">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className="badge">{logo?.url ? "Customer branding active" : "Default Axiom branding"}</span>
      </div>

      <div className={previewClass}>
        <Image src={activePath} alt={`${title} preview`} width={slot === "smallLogo" ? 92 : 320} height={slot === "smallLogo" ? 92 : 160} />
      </div>

      <div className="grid compactGrid">
        <div className="miniPanel"><span className="labelText">Last updated</span><strong>{formatDate(logo?.updatedAt)}</strong></div>
        <div className="miniPanel"><span className="labelText">Updated by</span><strong>{logo?.updatedById ? "Recorded" : "Not recorded"}</strong></div>
        <div className="miniPanel"><span className="labelText">File type</span><strong>{logo?.contentType || "Default asset"}</strong></div>
      </div>

      {uploadState.success ? <p className="successBox">{uploadState.success}</p> : null}
      {uploadState.error ? <p className="warningBox">{uploadState.error}</p> : null}
      <form action={uploadAction}>
        <input type="hidden" name="slot" value={slot} />
        <label className="field"><span>Upload replacement</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <p className="muted">Allowed file types: PNG, JPG/JPEG and WebP. Maximum file size: 2 MB. SVG uploads are not accepted.</p>
        <SubmitButton>Upload replacement</SubmitButton>
      </form>

      {resetState.success ? <p className="successBox">{resetState.success}</p> : null}
      {resetState.error ? <p className="warningBox">{resetState.error}</p> : null}
      <form action={resetAction}>
        <input type="hidden" name="slot" value={slot} />
        <SubmitButton>Reset to Axiom default</SubmitButton>
      </form>
    </section>
  );
}

export function BrandingSettingsForm({ smallLogo, fullLogo, defaultSmallLogo, defaultFullLogo }: { smallLogo?: BrandingLogo | null; fullLogo?: BrandingLogo | null; defaultSmallLogo: string; defaultFullLogo: string }) {
  return (
    <div className="stack">
      <LogoPanel
        slot="smallLogo"
        title="Small app logo / icon"
        description="Used in the top-left corner of the app shell and sidebar after login."
        logo={smallLogo}
        fallbackPath={defaultSmallLogo}
      />
      <LogoPanel
        slot="fullLogo"
        title="Full login logo"
        description="Used on the login screen where this app can safely resolve the customer before login."
        logo={fullLogo}
        fallbackPath={defaultFullLogo}
      />
    </div>
  );
}
