"use client";

import { useActionState } from "react";
import Link from "next/link";
import { verifyMfaAction, type AuthActionState } from "@/lib/actions/auth.actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: AuthActionState = {};

export function MfaForm() {
  const [state, formAction] = useActionState(verifyMfaAction, initialState);

  return (
    <form className="loginCard" action={formAction}>
      <h1>Sign-in code</h1>
      <p className="muted">Enter the 6-digit code sent to your email address. The code expires after 10 minutes.</p>
      {state.error ? <p className="warningBox" role="alert" aria-live="polite">{state.error}</p> : null}
      <label className="field"><span>One-time code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
      <SubmitButton>Verify code</SubmitButton>
      <p><Link href="/login">Request a new code</Link></p>
    </form>
  );
}
