export const dynamic = "force-dynamic";

import { MfaForm } from "@/components/mfa-form";

export default function MfaPage() {
  return (
    <div className="loginWrap">
      <MfaForm />
    </div>
  );
}
