"use client";

import { useActionState, useState } from "react";
import { acceptInviteAction, type AuthActionState } from "@/lib/actions/auth.actions";

const initialState: AuthActionState = {};

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="warningBox" role="alert" aria-live="polite">{state.error}</p> : null}
      {state.success ? <p className="successBox" role="status" aria-live="polite">{state.success}</p> : null}
      <label className="field">
        <span>New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      <button className="primary" disabled={pending}>{pending ? "Setting password..." : "Set password"}</button>
    </form>
  );
}
