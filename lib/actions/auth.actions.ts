"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, requireUser } from "@/lib/auth";
import { validatePassword } from "@/lib/password";
import { randomToken, sha256 } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { getTenantPasswordPolicy } from "@/lib/password-policy";
import { escapeHtml } from "@/lib/html";
import { getAppUrl } from "@/lib/app-url";
import { authConfig } from "@/config/auth.config";

const failedLoginWindowMs = 5 * 60 * 1000;
const lockoutMs = 15 * 60 * 1000;
const maxFailedLogins = 5;
const passwordResetExpiryMs = 30 * 60 * 1000;
const mfaExpiryMs = authConfig.mfaCodeMinutes * 60 * 1000;
const mfaCookieName = authConfig.mfaCookieName;

function requiresMfa(user: { role: string; mfaRequired: boolean }) {
  return user.mfaRequired;
}

async function createMfaChallenge(user: { id: string; tenantId: string | null; email: string }) {
  const recent = await prisma.mfaChallenge.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - 60_000) } },
    orderBy: { createdAt: "desc" }
  });
  if (recent) return { throttled: true };
  const challengeToken = randomToken(32);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.mfaChallenge.create({
    data: {
      userId: user.id,
      challengeHash: sha256(challengeToken),
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + mfaExpiryMs)
    }
  });
  (await cookies()).set(mfaCookieName, challengeToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + mfaExpiryMs)
  });
  const sendResult = await sendEmail({
    tenantId: user.tenantId,
    requestedById: user.id,
    to: user.email,
    notificationType: "mfa",
    subject: "Your Axiom sign-in code",
    html: `<p>Your one-time sign-in code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
  });
  if (!sendResult.ok) {
    await prisma.mfaChallenge.update({ where: { challengeHash: sha256(challengeToken) }, data: { usedAt: new Date() } });
    (await cookies()).delete(mfaCookieName);
    await audit({ tenantId: user.tenantId, userId: user.id, action: "MFA_CODE_DELIVERY_FAILED", entityType: "MfaChallenge" });
    return { throttled: false, error: "We could not send your sign-in code. Please contact support or check the email provider setup." };
  }
  await audit({ tenantId: user.tenantId, userId: user.id, action: "MFA_CODE_REQUESTED", entityType: "MfaChallenge" });
  return { throttled: false };
}

export type AuthActionState = { success?: string; error?: string };

function getActionFormData(previousStateOrFormData: AuthActionState | FormData, formData?: FormData) {
  return formData || previousStateOrFormData as FormData;
}

export async function loginAction(previousStateOrFormData: AuthActionState | FormData, formData?: FormData): Promise<AuthActionState> {
  const data = getActionFormData(previousStateOrFormData, formData);
  const email = String(data.get("email") || "").toLowerCase();
  const password = String(data.get("password") || "");
  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  if (!user || !user.isActive || !user.passwordHash) return { error: "Invalid email or password." };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "Too many login attempts. Please try again shortly." };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const now = new Date();
    const windowStart = user.failedLoginWindowStart && now.getTime() - user.failedLoginWindowStart.getTime() <= failedLoginWindowMs ? user.failedLoginWindowStart : now;
    const nextFailedCount = windowStart === user.failedLoginWindowStart ? user.failedLoginCount + 1 : 1;
    const lockedUntil = nextFailedCount >= maxFailedLogins ? new Date(now.getTime() + lockoutMs) : null;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: nextFailedCount, failedLoginWindowStart: windowStart, lockedUntil } });
    await audit({ tenantId: user.tenantId, userId: user.id, action: lockedUntil ? "LOGIN_LOCKED_OUT" : "LOGIN_FAILED", entityType: "User" });
    return { error: "Invalid email or password." };
  }
  if (requiresMfa(user)) {
    const challenge = await createMfaChallenge(user);
    if (challenge.throttled) return { error: "A sign-in code was requested recently. Please wait a moment before requesting another." };
    if (challenge.error) return { error: challenge.error };
    redirect("/mfa");
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, failedLoginWindowStart: null, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id);
  if (user.forcePasswordChange) redirect("/change-password");
  redirect("/dashboard");
}

export async function changePasswordAction(formData: FormData) {
  const actor = await requireUser({ allowForcePasswordChange: true });
  const current = String(formData.get("currentPassword") || "");
  const next = String(formData.get("newPassword") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  if (next !== confirm) return { error: "New passwords do not match." };
  const result = validatePassword(next, await getTenantPasswordPolicy(actor.tenantId));
  if (!result.ok) return { error: `Password must include ${result.errors.join(", ")}.` };
  if (!actor.passwordHash || !(await bcrypt.compare(current, actor.passwordHash))) {
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: "PASSWORD_CHANGE_FAILED", entityType: "User" });
    return { error: "Current password is incorrect." };
  }
  await prisma.user.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(next, 12), forcePasswordChange: false } });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "PASSWORD_CHANGED", entityType: "User" });
  redirect("/dashboard");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") || "").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const token = randomToken(32);
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + passwordResetExpiryMs) } });
    const resetLink = getAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    await sendEmail({ tenantId: user.tenantId, requestedById: user.id, to: email, notificationType: "password_reset", subject: "Reset your password", html: `<p>Use this link within 30 minutes: <a href="${escapeHtml(resetLink)}">Reset your password</a></p>` });
  }
  return { success: "If the email exists, a reset link has been sent." };
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  if (password !== confirm) return { error: "Passwords do not match." };
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return { error: "Reset link has expired." };
  const result = validatePassword(password, await getTenantPasswordPolicy(reset.user.tenantId));
  if (!result.ok) return { error: `Password must include ${result.errors.join(", ")}.` };
  await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(password, 12), isActive: true, forcePasswordChange: false } });
  await prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
  redirect("/login");
}

export async function acceptInviteAction(previousStateOrFormData: AuthActionState | FormData, formData?: FormData): Promise<AuthActionState> {
  const data = getActionFormData(previousStateOrFormData, formData);
  const token = String(data.get("token") || "");
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirmPassword") || "");
  if (!token) return { error: "Invite link is missing or invalid." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const invite = await prisma.userInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!invite) return { error: "Invite link is invalid." };
  if (invite.usedAt) return { error: "This invite link has already been used." };
  if (invite.expiresAt < new Date()) return { error: "This invite link has expired. Please ask an administrator to resend your invite." };
  if (!invite.user) return { error: "Invite could not be matched to a user account. Please ask an administrator to resend your invite." };
  const result = validatePassword(password, await getTenantPasswordPolicy(invite.tenantId));
  if (!result.ok) return { error: `Password must include ${result.errors.join(", ")}.` };

  await prisma.user.update({
    where: { id: invite.userId },
    data: { passwordHash: await bcrypt.hash(password, 12), isActive: true, forcePasswordChange: false, inviteAcceptedAt: new Date() }
  });
  await prisma.userInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  redirect("/login?invite=accepted");
}

export async function verifyMfaAction(previousStateOrFormData: AuthActionState | FormData, formData?: FormData): Promise<AuthActionState> {
  const data = getActionFormData(previousStateOrFormData, formData);
  const code = String(data.get("code") || "").trim();
  const challengeToken = (await cookies()).get(mfaCookieName)?.value;
  if (!challengeToken) return { error: "Your sign-in code has expired. Please sign in again to request a new code." };
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit sign-in code from your email." };
  const challenge = await prisma.mfaChallenge.findUnique({ where: { challengeHash: sha256(challengeToken) }, include: { user: true } });
  if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) return { error: "Your sign-in code is invalid or has expired. Please sign in again to request a new code." };
  if (challenge.failedAttemptCount >= 5) return { error: "Too many incorrect sign-in code attempts. Please sign in again." };
  if (challenge.codeHash !== sha256(code)) {
    await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { failedAttemptCount: { increment: 1 } } });
    await audit({ tenantId: challenge.user.tenantId, userId: challenge.userId, action: "MFA_FAILED", entityType: "MfaChallenge", entityId: challenge.id });
    return { error: "That sign-in code was not recognised. Check the code and try again." };
  }
  await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
  await prisma.user.update({ where: { id: challenge.userId }, data: { failedLoginCount: 0, failedLoginWindowStart: null, lockedUntil: null, lastLoginAt: new Date() } });
  (await cookies()).delete(mfaCookieName);
  await audit({ tenantId: challenge.user.tenantId, userId: challenge.userId, action: "MFA_PASSED", entityType: "MfaChallenge", entityId: challenge.id });
  await createSession(challenge.userId);
  if (challenge.user.forcePasswordChange) redirect("/change-password");
  redirect("/dashboard");
}
