import { SetPasswordForm } from "@/components/set-password-form";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token || "";
  return <div className="loginWrap"><div className="loginCard"><h1>Set your password</h1><p>Your invite link is valid for 24 hours or until it has been used.</p><p className="muted">Password minimum: 8 characters, at least one uppercase letter, one lowercase letter, one number and one letter.</p><SetPasswordForm token={token}/></div></div>;
}
