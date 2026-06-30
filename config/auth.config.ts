export const authConfig = {
  sessionCookieName: "axiom_session",
  mfaCookieName: "axiom_mfa_pending",
  sessionDays: 7,
  resetTokenHours: 168,
  inviteTokenHours: 24,
  mfaCodeMinutes: 10,
  failedLoginLimit: 5,
  failedLoginWindowMinutes: 5,
  lockoutMinutes: 15
};
