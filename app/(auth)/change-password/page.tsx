export const dynamic = "force-dynamic";

import { changePasswordAction } from "@/lib/actions/auth.actions";
import { requireUser } from "@/lib/auth";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

export default async function ChangePassword() {
  await requireUser({ allowForcePasswordChange: true });
  return (
    <div className="loginWrap">
      <form className="loginCard" action={changePasswordAction as unknown as (formData: FormData) => void}>
        <h1>Change password</h1>
        <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
        <PasswordField name="newPassword" label="New password" autoComplete="new-password" />
        <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        <SubmitButton>Save password</SubmitButton>
      </form>
    </div>
  );
}
