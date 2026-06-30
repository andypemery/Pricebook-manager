"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { loginAction, type AuthActionState } from "@/lib/actions/auth.actions";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

const initialState: AuthActionState = {};

export function LoginForm({ logoPath, title, inviteAccepted }: { logoPath: string; title: string; inviteAccepted: boolean }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form className="loginCard" action={formAction}>
      <Image src={logoPath} alt="Axiom Process Solutions" width={280} height={120} />
      <h1>{title}</h1>
      {inviteAccepted ? <p className="successBox" role="status">Password created. Please sign in.</p> : null}
      {state.error ? <p className="warningBox" role="alert" aria-live="polite">{state.error}</p> : null}
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      <SubmitButton>Sign in</SubmitButton>
      <p><Link href="/forgot-password">Forgot password?</Link></p>
    </form>
  );
}
