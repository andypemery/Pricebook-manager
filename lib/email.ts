import net from "net";
import tls from "tls";
import crypto from "crypto";
import { EmailConnectionStatus, type EmailProviderMode, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/crypto";
import { axiomDefaults } from "@/config/axiom-defaults";

export type NotificationType = "user_invite" | "password_reset" | "mfa" | "support" | "feature_request" | "security_issue" | "backup" | "general";
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  notificationType?: NotificationType;
  tenantId?: string | null;
  requestedById?: string | null;
};
export type EmailResult = { ok: boolean; skipped?: boolean; providerMode: EmailProviderMode; message: string };

type SenderProfile = { fromEmail: string; displayName: string; replyToEmail?: string };
type ProviderConfig = SenderProfile & {
  mode: EmailProviderMode;
  status: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  smtpPassword?: string | null;
  smtpSecure?: boolean;
  graphTenantId?: string | null;
  graphClientId?: string | null;
  graphClientSecret?: string | null;
  graphSenderEmail?: string | null;
  graphSenderUserId?: string | null;
  axiomFallbackEnabled?: boolean;
};

const senderEnvByType: Record<NotificationType, string> = {
  user_invite: "INVITES_FROM_EMAIL",
  password_reset: "NOTIFICATIONS_FROM_EMAIL",
  mfa: "NOTIFICATIONS_FROM_EMAIL",
  support: "SUPPORT_FROM_EMAIL",
  feature_request: "NOTIFICATIONS_FROM_EMAIL",
  security_issue: "SECURITY_FROM_EMAIL",
  backup: "NOTIFICATIONS_FROM_EMAIL",
  general: "NOTIFICATIONS_FROM_EMAIL"
};

const profileKeyByType: Record<NotificationType, string> = {
  user_invite: "system_notifications",
  password_reset: "system_notifications",
  mfa: "system_notifications",
  support: "support_emails",
  feature_request: "workflow_emails",
  security_issue: "system_notifications",
  backup: "system_notifications",
  general: "system_notifications"
};

export const standardEmailProfiles = [
  { key: "system_notifications", displayName: "System Notifications", notificationTypes: ["user_invite", "password_reset", "mfa", "security_issue", "backup", "general"] },
  { key: "support_emails", displayName: "Support Emails", notificationTypes: ["support"] },
  { key: "workflow_emails", displayName: "Workflow Emails", notificationTypes: ["feature_request"] },
  { key: "user_sent_emails", displayName: "User-Sent Emails", notificationTypes: ["user_sent_emails"] }
] as const;

function secretKey() {
  const source = process.env.EMAIL_SECRET || process.env.SESSION_SECRET || "local-development-email-secret";
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptEmailSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptEmailSecret(value?: string | null) {
  if (!value) return null;
  const [ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");
}

export function getSenderProfile(notificationType: NotificationType = "general"): SenderProfile {
  const specific = process.env[senderEnvByType[notificationType]];
  return {
    fromEmail: process.env.AXIOM_EMAIL_FROM || specific || process.env.NOTIFICATIONS_FROM_EMAIL || axiomDefaults.email.from,
    displayName: process.env.AXIOM_EMAIL_DISPLAY_NAME || process.env.NOTIFICATIONS_FROM_NAME || axiomDefaults.email.displayName,
    replyToEmail: process.env.AXIOM_EMAIL_REPLY_TO || process.env.NOTIFICATIONS_REPLY_TO_EMAIL || process.env.SUPPORT_EMAIL || axiomDefaults.email.replyTo
  };
}

export function isAxiomSenderConfigured() {
  const mode = process.env.AXIOM_EMAIL_MODE;
  if (mode === "graph") {
    return Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && (process.env.MICROSOFT_SENDER_USER_ID || process.env.MICROSOFT_SENDER_EMAIL));
  }
  if (mode === "smtp") {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && (process.env.SMTP_FROM || process.env.AXIOM_EMAIL_FROM || process.env.NOTIFICATIONS_FROM_EMAIL));
  }
  return false;
}

export function axiomSetupStatus() {
  return isAxiomSenderConfigured() ? EmailConnectionStatus.CONFIGURED : EmailConnectionStatus.NOT_CONFIGURED;
}

export async function ensureDefaultEmailSetup(tenantId: string, updatedById?: string | null) {
  const sender = getSenderProfile("general");
  const existing = await prisma.emailProviderSetting.findUnique({ where: { tenantId } });
  if (!existing) {
    await prisma.emailProviderSetting.create({
      data: {
        tenantId,
        mode: "AXIOM",
        status: axiomSetupStatus(),
        isEnabled: true,
        customerSendingDisabled: false,
        axiomFallbackEnabled: true,
        senderDisplayName: sender.displayName,
        fromEmail: sender.fromEmail,
        replyToEmail: sender.replyToEmail,
        updatedById: updatedById || null
      }
    });
  } else if (existing.mode === "AXIOM") {
    await prisma.emailProviderSetting.update({
      where: { tenantId },
      data: {
        status: axiomSetupStatus(),
        isEnabled: true,
        customerSendingDisabled: false,
        axiomFallbackEnabled: true,
        updatedById: updatedById || existing.updatedById
      }
    });
  }

  for (const profile of standardEmailProfiles) {
    const senderProfile = await prisma.emailSenderProfile.upsert({
      where: { tenantId_key: { tenantId, key: profile.key } },
      update: {},
      create: {
        tenantId,
        key: profile.key,
        displayName: profile.displayName,
        fromEmail: sender.fromEmail,
        replyToEmail: sender.replyToEmail,
        isAxiomManaged: true
      }
    });
    for (const notificationType of profile.notificationTypes) {
      await prisma.notificationRoute.upsert({
        where: { tenantId_notificationType: { tenantId, notificationType } },
        update: {},
        create: { tenantId, notificationType, senderProfileId: senderProfile.id }
      });
    }
  }
}

export async function backfillDefaultEmailSetup(updatedById?: string | null) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await ensureDefaultEmailSetup(tenant.id, updatedById);
  }
}

function safeEmailAddress(value: string) {
  return value.replace(/[\r\n<>]/g, "").trim();
}

function htmlToText(html: string) {
  return html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

async function loadProvider(message: EmailMessage): Promise<ProviderConfig> {
  const axiomSender = getSenderProfile(message.notificationType || "general");
  if (!message.tenantId) return { ...axiomSender, mode: (process.env.AXIOM_EMAIL_MODE === "smtp" ? "SMTP" : process.env.AXIOM_EMAIL_MODE === "graph" ? "MICROSOFT_GRAPH" : "AXIOM"), status: "CONFIGURED" };

  const profileKey = profileKeyByType[message.notificationType || "general"];
  await ensureDefaultEmailSetup(message.tenantId, message.requestedById);
  const [setting, senderProfile] = await Promise.all([
    prisma.emailProviderSetting.findUnique({ where: { tenantId: message.tenantId } }),
    prisma.emailSenderProfile.findUnique({ where: { tenantId_key: { tenantId: message.tenantId, key: profileKey } } })
  ]);
  const profileSender = senderProfile ? { fromEmail: senderProfile.fromEmail, displayName: senderProfile.displayName, replyToEmail: senderProfile.replyToEmail || undefined } : axiomSender;
  if (!setting || !setting.isEnabled || setting.customerSendingDisabled) return { ...profileSender, mode: "AXIOM", status: "CONFIGURED" };
  if (setting.mode === "AXIOM") return { ...profileSender, mode: "AXIOM", status: setting.status, axiomFallbackEnabled: setting.axiomFallbackEnabled };
  if (setting.mode === "SMTP") {
    return {
      mode: "SMTP",
      status: setting.status,
      fromEmail: senderProfile?.fromEmail || setting.fromEmail,
      displayName: senderProfile?.displayName || setting.senderDisplayName,
      replyToEmail: senderProfile?.replyToEmail || setting.replyToEmail || undefined,
      smtpHost: setting.smtpHost,
      smtpPort: setting.smtpPort,
      smtpUsername: setting.smtpUsername,
      smtpPassword: decryptEmailSecret(setting.smtpPasswordEncrypted),
      smtpSecure: setting.smtpSecure,
      axiomFallbackEnabled: setting.axiomFallbackEnabled
    };
  }
  return {
    mode: "MICROSOFT_GRAPH",
    status: setting.status,
    fromEmail: senderProfile?.fromEmail || setting.fromEmail,
    displayName: senderProfile?.displayName || setting.senderDisplayName,
    replyToEmail: senderProfile?.replyToEmail || setting.replyToEmail || undefined,
    graphTenantId: setting.graphTenantId,
    graphClientId: setting.graphClientId,
    graphClientSecret: decryptEmailSecret(setting.graphClientSecretEncrypted),
    graphSenderEmail: setting.graphSenderEmail,
    graphSenderUserId: setting.graphSenderUserId,
    axiomFallbackEnabled: setting.axiomFallbackEnabled
  };
}

async function logSend(message: EmailMessage, providerMode: EmailProviderMode, success: boolean, eventType: string, safeMessage: string) {
  await prisma.emailSendLog.create({
    data: {
      tenantId: message.tenantId || null,
      userId: message.requestedById || null,
      notificationType: message.notificationType || "general",
      providerMode,
      toEmailHash: sha256(message.to.toLowerCase()),
      subject: message.subject.slice(0, 180),
      success,
      eventType,
      safeMessage: safeMessage.slice(0, 500)
    }
  }).catch(() => undefined);
}

async function updateProviderTimestamps(tenantId: string | null | undefined, ok: boolean, message: string) {
  if (!tenantId) return;
  await prisma.emailProviderSetting.update({
    where: { tenantId },
    data: ok ? { lastSuccessfulSendAt: new Date(), lastTestResult: message, lastError: null } : { lastFailedSendAt: new Date(), lastTestResult: message, lastError: message.slice(0, 500) }
  }).catch(() => undefined);
}

async function sendViaGraph(message: EmailMessage, provider: ProviderConfig) {
  const tenantId = provider.graphTenantId || process.env.MICROSOFT_TENANT_ID;
  const clientId = provider.graphClientId || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = provider.graphClientSecret || process.env.MICROSOFT_CLIENT_SECRET;
  const sender = provider.graphSenderUserId || provider.graphSenderEmail || process.env.MICROSOFT_SENDER_USER_ID || process.env.MICROSOFT_SENDER_EMAIL || provider.fromEmail;
  if (!tenantId || !clientId || !clientSecret || !sender) throw new Error("Microsoft Graph sending is not fully configured.");

  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
  });
  if (!tokenResponse.ok) throw new Error("Microsoft Graph token request failed.");
  const tokenJson = await tokenResponse.json() as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("Microsoft Graph token was not returned.");

  const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: [{ emailAddress: { address: message.to } }],
        replyTo: provider.replyToEmail ? [{ emailAddress: { address: provider.replyToEmail } }] : undefined
      },
      saveToSentItems: true
    })
  });
  if (!sendResponse.ok) throw new Error("Microsoft Graph sendMail failed.");
}

function readSmtpResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const onData = (chunk: Buffer) => {
      data += chunk.toString("utf8");
      const lines = data.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) cleanup();
      if (/^\d{3} /.test(last)) resolve(data);
    };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); };
    socket.on("data", onData); socket.on("error", onError);
  });
}

async function smtpCommand(socket: net.Socket | tls.TLSSocket, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP command failed with ${code}`);
  return response;
}

function connectSmtp(host: string, port: number, secure: boolean): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect(port, host, { servername: host }) : net.connect(port, host);
    socket.once("connect", () => resolve(socket));
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function sendViaSmtp(message: EmailMessage, provider: ProviderConfig) {
  const host = provider.smtpHost || process.env.SMTP_HOST;
  const port = provider.smtpPort || Number(process.env.SMTP_PORT || (provider.smtpSecure ? 465 : 587));
  const username = provider.smtpUsername || process.env.SMTP_USER;
  const password = provider.smtpPassword || process.env.SMTP_PASSWORD;
  const from = provider.fromEmail || process.env.SMTP_FROM;
  if (!host || !port || !username || !password || !from) throw new Error("SMTP sending is not fully configured.");
  let socket = await connectSmtp(host, port, Boolean(provider.smtpSecure ?? process.env.SMTP_SECURE !== "false"));
  await readSmtpResponse(socket);
  await smtpCommand(socket, "EHLO axiomps.co.uk", [250]);
  if (!Boolean(provider.smtpSecure ?? process.env.SMTP_SECURE !== "false") && port !== 25) {
    await smtpCommand(socket, "STARTTLS", [220]);
    socket = tls.connect({ socket, servername: host });
    await smtpCommand(socket, "EHLO axiomps.co.uk", [250]);
  }
  await smtpCommand(socket, "AUTH LOGIN", [334]);
  await smtpCommand(socket, Buffer.from(username).toString("base64"), [334]);
  await smtpCommand(socket, Buffer.from(password).toString("base64"), [235]);
  await smtpCommand(socket, `MAIL FROM:<${safeEmailAddress(from)}>`, [250]);
  await smtpCommand(socket, `RCPT TO:<${safeEmailAddress(message.to)}>`, [250, 251]);
  await smtpCommand(socket, "DATA", [354]);
  const text = message.text || htmlToText(message.html);
  const raw = [
    `From: ${provider.displayName} <${safeEmailAddress(from)}>`,
    `To: <${safeEmailAddress(message.to)}>`,
    provider.replyToEmail ? `Reply-To: ${safeEmailAddress(provider.replyToEmail)}` : "",
    `Subject: ${message.subject.replace(/[\r\n]/g, " ")}`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=axiom-boundary",
    "",
    "--axiom-boundary",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
    "--axiom-boundary",
    "Content-Type: text/html; charset=utf-8",
    "",
    message.html,
    "--axiom-boundary--",
    "."
  ].filter(Boolean).join("\r\n");
  await smtpCommand(socket, raw, [250]);
  socket.write("QUIT\r\n");
  socket.end();
}

async function sendUsingProvider(message: EmailMessage, provider: ProviderConfig) {
  if (provider.mode === "MICROSOFT_GRAPH") return sendViaGraph(message, provider);
  if (provider.mode === "SMTP") return sendViaSmtp(message, provider);
  const mode = process.env.AXIOM_EMAIL_MODE;
  if (mode === "graph") return sendViaGraph(message, { ...provider, mode: "MICROSOFT_GRAPH" });
  if (mode === "smtp") return sendViaSmtp(message, { ...provider, mode: "SMTP", smtpHost: process.env.SMTP_HOST, smtpPort: Number(process.env.SMTP_PORT || 587), smtpUsername: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD, smtpSecure: process.env.SMTP_SECURE !== "false", fromEmail: process.env.SMTP_FROM || provider.fromEmail, replyToEmail: process.env.SMTP_REPLY_TO || provider.replyToEmail });
  throw new Error("Axiom Email Notifications need Axiom deployment setup before real emails can be sent.");
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = await loadProvider(message);
  try {
    await sendUsingProvider(message, provider);
    await logSend(message, provider.mode, true, "email_sent", "Email sent.");
    await updateProviderTimestamps(message.tenantId, true, "Last send succeeded.");
    return { ok: true, providerMode: provider.mode, message: "Email sent." };
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : "Email sending failed.";
    await logSend(message, provider.mode, false, "email_failed", safeMessage);
    await updateProviderTimestamps(message.tenantId, false, safeMessage);
    if (message.tenantId && provider.mode !== "AXIOM" && provider.axiomFallbackEnabled) {
      const axiomProvider = { ...getSenderProfile(message.notificationType || "general"), mode: "AXIOM" as const, status: "CONFIGURED" };
      try {
        await sendUsingProvider(message, axiomProvider);
        await logSend(message, "AXIOM", true, "fallback_sender_used", "Fallback to Axiom sender used.");
        return { ok: true, providerMode: "AXIOM", message: "Customer provider failed, fallback to Axiom sender was used." };
      } catch (fallbackError) {
        const fallbackSafeMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback sender failed.";
        await logSend(message, "AXIOM", false, "email_failed", fallbackSafeMessage);
      }
    }
    return { ok: false, providerMode: provider.mode, message: safeMessage };
  }
}

export async function sendTemplateEmail(message: EmailMessage & { templateKey?: string; variables?: Record<string, string> }) {
  if (!message.templateKey) return sendEmail(message);
  const template = await prisma.emailTemplate.findFirst({ where: { tenantId: message.tenantId || undefined, key: message.templateKey } }) || await prisma.emailTemplate.findFirst({ where: { tenantId: null, key: message.templateKey } });
  if (!template) return sendEmail(message);
  const replace = (value: string) => Object.entries(message.variables || {}).reduce((text, [key, variable]) => text.replaceAll(`{{${key}}}`, variable), value);
  return sendEmail({ ...message, subject: replace(template.subject), html: replace(template.body) });
}

export async function sendTestEmail(args: { tenantId: string; requestedById: string; to: string }) {
  const result = await sendEmail({
    tenantId: args.tenantId,
    requestedById: args.requestedById,
    to: args.to,
    notificationType: "general",
    subject: "Axiom test email",
    html: "<p>This is a test email from your Axiom app email settings.</p><p>If you received this, the selected email provider is working.</p>"
  });
  await logSend({ tenantId: args.tenantId, requestedById: args.requestedById, to: args.to, subject: "Axiom test email", html: "", notificationType: "general" }, result.providerMode, result.ok, result.ok ? "test_email_sent" : "test_email_failed", result.message);
  return result;
}

export function providerStatusSummary(setting: { mode: EmailProviderMode; status: string; lastSuccessfulSendAt?: Date | null; lastFailedSendAt?: Date | null } | null) {
  if (!setting) return "Using Axiom sender by default.";
  if (setting.status === "CONNECTED" || setting.status === "CONFIGURED") return `Configured for ${setting.mode.replace("MICROSOFT_GRAPH", "Microsoft 365")}.`;
  return `Email provider status: ${setting.status}.`;
}

export function toSafeJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
