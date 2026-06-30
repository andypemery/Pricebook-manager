"use server";

import { EmailConnectionStatus, EmailProviderMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAxiomAdmin, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { axiomSetupStatus, encryptEmailSecret, sendTestEmail, toSafeJson } from "@/lib/email";
import { hasPermission } from "@/lib/permissions";
import { axiomDefaults } from "@/config/axiom-defaults";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function emailMode(value: string): EmailProviderMode {
  if (value === "MICROSOFT_GRAPH") return EmailProviderMode.MICROSOFT_GRAPH;
  if (value === "SMTP") return EmailProviderMode.SMTP;
  return EmailProviderMode.AXIOM;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/secret|password|token|client_secret/gi, "credential") : "The email action failed.";
}

export async function saveEmailSettingsAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { error: "You do not have permission to manage email settings." };
  if (!actor.tenantId) return { error: "No tenant is available for this user." };

  const mode = emailMode(clean(formData.get("mode")));
  const existing = await prisma.emailProviderSetting.findUnique({ where: { tenantId: actor.tenantId } });
  const smtpPassword = clean(formData.get("smtpPassword"));
  const graphSecret = clean(formData.get("graphClientSecret"));
  const status = mode === EmailProviderMode.AXIOM ? axiomSetupStatus() : EmailConnectionStatus.CONFIGURED;

  const data = {
    mode,
    status,
    isEnabled: true,
    customerSendingDisabled: false,
    axiomFallbackEnabled: formData.get("axiomFallbackEnabled") === "on",
    senderDisplayName: clean(formData.get("senderDisplayName")) || axiomDefaults.email.displayName,
    fromEmail: clean(formData.get("fromEmail")) || axiomDefaults.email.from,
    replyToEmail: clean(formData.get("replyToEmail")) || axiomDefaults.email.replyTo,
    smtpHost: clean(formData.get("smtpHost")) || null,
    smtpPort: clean(formData.get("smtpPort")) ? Number(clean(formData.get("smtpPort"))) : null,
    smtpUsername: clean(formData.get("smtpUsername")) || null,
    smtpPasswordEncrypted: smtpPassword ? encryptEmailSecret(smtpPassword) : existing?.smtpPasswordEncrypted || null,
    smtpSecure: formData.get("smtpSecure") === "on",
    graphTenantId: clean(formData.get("graphTenantId")) || null,
    graphClientId: clean(formData.get("graphClientId")) || null,
    graphClientSecretEncrypted: graphSecret ? encryptEmailSecret(graphSecret) : existing?.graphClientSecretEncrypted || null,
    graphSenderEmail: clean(formData.get("graphSenderEmail")) || null,
    graphSenderUserId: clean(formData.get("graphSenderUserId")) || null,
    updatedById: actor.id
  };

  await prisma.emailProviderSetting.upsert({
    where: { tenantId: actor.tenantId },
    update: data,
    create: { tenantId: actor.tenantId, ...data }
  });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "EMAIL_SETTINGS_CHANGED", entityType: "EmailProviderSetting", before: existing ? toSafeJson({ mode: existing.mode, status: existing.status, fromEmail: existing.fromEmail }) : undefined, after: toSafeJson({ mode, fromEmail: data.fromEmail, replyToEmail: data.replyToEmail, axiomFallbackEnabled: data.axiomFallbackEnabled }) });
  revalidatePath("/account/email-settings");
  return { success: "Email settings saved." };
}

export async function sendEmailSettingsTestAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { error: "You do not have permission to test email settings." };
  if (!actor.tenantId) return { error: "No tenant is available for this user." };
  const to = clean(formData.get("testRecipient"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: "Enter a valid test recipient email address." };
  const result = await sendTestEmail({ tenantId: actor.tenantId, requestedById: actor.id, to });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: result.ok ? "TEST_EMAIL_SENT" : "TEST_EMAIL_FAILED", entityType: "EmailProviderSetting", after: toSafeJson({ providerMode: result.providerMode, message: result.message }) });
  revalidatePath("/account/email-settings");
  return result.ok ? { success: result.message, clearForm: true } : { error: result.message };
}

export async function disconnectEmailProviderAction() {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { error: "You do not have permission." };
  if (!actor.tenantId) return { error: "No tenant is available for this user." };
  await prisma.emailProviderSetting.upsert({
    where: { tenantId: actor.tenantId },
    update: { status: EmailConnectionStatus.DISCONNECTED, isEnabled: false, updatedById: actor.id },
    create: { tenantId: actor.tenantId, status: EmailConnectionStatus.DISCONNECTED, isEnabled: false, updatedById: actor.id }
  });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "EMAIL_PROVIDER_DISCONNECTED", entityType: "EmailProviderSetting" });
  revalidatePath("/account/email-settings");
  return { success: "Email provider disconnected. Axiom sender fallback remains available where configured." };
}

export async function saveEmailSenderProfileAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { error: "You do not have permission to manage email sending profiles." };
  if (!actor.tenantId) return { error: "No tenant is available for this user." };
  const key = clean(formData.get("key"));
  const allowedKeys = ["system_notifications", "support_emails", "workflow_emails", "user_sent_emails"];
  if (!allowedKeys.includes(key)) return { error: "Unknown sending profile." };
  const displayName = clean(formData.get("displayName")) || axiomDefaults.email.displayName;
  const fromEmail = clean(formData.get("fromEmail"));
  const replyToEmail = clean(formData.get("replyToEmail")) || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) return { error: "Enter a valid from address." };

  const profile = await prisma.emailSenderProfile.upsert({
    where: { tenantId_key: { tenantId: actor.tenantId, key } },
    update: { displayName, fromEmail, replyToEmail, isAxiomManaged: false },
    create: { tenantId: actor.tenantId, key, displayName, fromEmail, replyToEmail, isAxiomManaged: false }
  });
  await prisma.notificationRoute.upsert({
    where: { tenantId_notificationType: { tenantId: actor.tenantId, notificationType: key } },
    update: { senderProfileId: profile.id },
    create: { tenantId: actor.tenantId, notificationType: key, senderProfileId: profile.id }
  });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "EMAIL_SENDING_PROFILE_UPDATED", entityType: "EmailSenderProfile", entityId: profile.id, after: toSafeJson({ key, displayName, fromEmail, hasReplyTo: Boolean(replyToEmail) }) });
  revalidatePath("/account/email-settings");
  return { success: "Sending profile saved." };
}

export async function axiomTestTenantEmailAction(formData: FormData) {
  const actor = await requireAxiomAdmin();
  const tenantId = clean(formData.get("tenantId"));
  const to = clean(formData.get("testRecipient"));
  if (!tenantId || !to) return { error: "Tenant and test recipient are required." };
  const result = await sendTestEmail({ tenantId, requestedById: actor.id, to });
  await audit({ tenantId, userId: actor.id, action: result.ok ? "AXIOM_TEST_EMAIL_SENT" : "AXIOM_TEST_EMAIL_FAILED", entityType: "EmailProviderSetting", after: toSafeJson({ providerMode: result.providerMode, message: result.message }) });
  revalidatePath("/axiom-admin/email-settings");
  return result.ok ? { success: result.message } : { error: result.message };
}

export async function axiomForceEmailFallbackAction(formData: FormData) {
  const actor = await requireAxiomAdmin();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) return { error: "Tenant is required." };
  try {
    await prisma.emailProviderSetting.upsert({
      where: { tenantId },
      update: { customerSendingDisabled: true, axiomFallbackEnabled: true, mode: EmailProviderMode.AXIOM, status: EmailConnectionStatus.DISABLED, updatedById: actor.id },
      create: { tenantId, customerSendingDisabled: true, axiomFallbackEnabled: true, mode: EmailProviderMode.AXIOM, status: EmailConnectionStatus.DISABLED, updatedById: actor.id }
    });
    await audit({ tenantId, userId: actor.id, action: "EMAIL_FALLBACK_FORCED", entityType: "EmailProviderSetting", reason: "Axiom Admin forced fallback to Axiom sender" });
    revalidatePath("/axiom-admin/email-settings");
    return { success: "Customer-managed email disabled and fallback to Axiom sender forced." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}
