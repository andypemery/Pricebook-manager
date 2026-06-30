"use server";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAxiomAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { rolePresets, permissionKeys, importPermissionColumnMap, type PermissionKey } from "@/config/permissions.config";
import { parseUserImportWorkbook } from "@/lib/simple-xlsx";
import { redirect } from "next/navigation";
import { normalisePasswordPolicy } from "@/lib/password-policy";
import { verifyReauthentication } from "@/lib/reauth";
import { getAppUrl } from "@/lib/app-url";

const customerRoles = ["VIEW_ONLY", "SUPER_USER", "CUSTOMER_ADMIN"] as const;

function safeRole(value: FormDataEntryValue | null): UserRole {
  const role = String(value || "VIEW_ONLY") as UserRole;
  return customerRoles.includes(role as (typeof customerRoles)[number]) ? role : "VIEW_ONLY";
}

function permissionsFromForm(formData: FormData): Record<string, boolean> {
  const permissions: Record<string, boolean> = {};
  for (const key of permissionKeys) {
    if (key === "manageAxiomControls") continue;
    permissions[key] = formData.get(key) === "on";
  }
  return permissions;
}

async function getRoleTemplatePermissions(tenantId: string, role: UserRole) {
  const template = await prisma.roleTemplate.findUnique({ where: { tenantId_role: { tenantId, role } } });
  if (template?.permissions && typeof template.permissions === "object" && !Array.isArray(template.permissions)) {
    return template.permissions as Record<string, boolean>;
  }
  const defaults: Record<string, boolean> = {};
  for (const key of permissionKeys) defaults[key] = rolePresets[role].includes(key as PermissionKey);
  defaults.manageAxiomControls = false;
  return defaults;
}

export async function createUserAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return { error: "You do not have permission." };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") || "").trim();
  const surname = String(formData.get("surname") || "").trim();
  const role = safeRole(formData.get("role"));

  if (!email || !firstName || !surname) return { error: "Email, first name and surname are required." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "A user with that email already exists." };

  const token = randomToken(32);
  const inviteUrl = getAppUrl(`/set-password?token=${encodeURIComponent(token)}`);
  const permissions = await getRoleTemplatePermissions(actor.tenantId, role);

  const user = await prisma.user.create({
    data: {
      tenantId: actor.tenantId,
      email,
      firstName,
      surname,
      role,
      permissions,
      passwordHash: null,
      isActive: false,
      forcePasswordChange: false,
      invitedAt: new Date()
    }
  });

  await prisma.userInvite.create({
    data: {
      tenantId: actor.tenantId,
      userId: user.id,
      email,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 24 * 3600000),
      createdById: actor.id
    }
  });

  await sendEmail({
    tenantId: actor.tenantId,
    requestedById: actor.id,
    to: email,
    notificationType: "user_invite",
    subject: "Set up your Axiom app account",
    html: `<p>You have been invited to use the app.</p><p>This link is valid for 24 hours or until it has been used:</p><p><a href="${inviteUrl}">Set your password</a></p>`
  });

  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "USER_INVITED", entityType: "User", entityId: user.id, after: { email, role } });
  revalidatePath("/admin/users");
  revalidatePath("/account");
  return { success: "User invited. The invite link is valid for 24 hours." };
}

export async function resendUserInviteAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return { error: "You do not have permission." };

  const userId = String(formData.get("userId") || "");
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: actor.tenantId } });
  if (!user) return { error: "User not found." };
  if (user.isActive && user.passwordHash) return { error: "This user has already accepted their invite." };

  const token = randomToken(32);
  const inviteUrl = getAppUrl(`/set-password?token=${encodeURIComponent(token)}`);

  await prisma.userInvite.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.userInvite.create({
    data: {
      tenantId: actor.tenantId,
      userId: user.id,
      email: user.email,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 24 * 3600000),
      createdById: actor.id,
      resentAt: new Date()
    }
  });

  await sendEmail({
    tenantId: actor.tenantId,
    requestedById: actor.id,
    to: user.email,
    notificationType: "user_invite",
    subject: "Your Axiom app invite link",
    html: `<p>Here is a fresh invite link.</p><p>This link is valid for 24 hours or until it has been used:</p><p><a href="${inviteUrl}">Set your password</a></p>`
  });

  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "USER_INVITE_RESENT", entityType: "User", entityId: user.id });
  revalidatePath("/admin/users");
  return { success: "Invite resent." };
}

export async function updateRoleTemplateAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return { error: "You do not have permission." };
  const role = safeRole(formData.get("role"));
  const displayName = role === "CUSTOMER_ADMIN" ? "Admin" : role === "SUPER_USER" ? "Super User" : "View Only";
  const permissions = permissionsFromForm(formData);
  permissions.manageAxiomControls = false;

  await prisma.roleTemplate.upsert({
    where: { tenantId_role: { tenantId: actor.tenantId, role } },
    update: { permissions, displayName, nameLocked: true, updatedById: actor.id },
    create: { tenantId: actor.tenantId, role, displayName, permissions, nameLocked: true, updatedById: actor.id }
  });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "ROLE_TEMPLATE_UPDATED", entityType: "RoleTemplate", entityId: role, after: permissions });
  revalidatePath("/account/role-templates");
  return { success: "Role template updated." };
}

export async function updateAppearanceAction(formData: FormData) {
  const actor = await requireUser();
  const theme = String(formData.get("theme") || "dark");
  const themePreference = ["dark", "light", "system"].includes(theme) ? theme : "dark";
  await prisma.user.update({ where: { id: actor.id }, data: { themePreference } });
  revalidatePath("/account/appearance");
  revalidatePath("/dashboard");
  return { success: "Appearance updated." };
}

export async function createGlobalMessageAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { error: "You do not have permission." };
  const hours = Math.min(72, Math.max(1, Number(formData.get("hours") || 24)));
  await prisma.globalMessage.create({
    data: {
      tenantId: actor.tenantId,
      message: String(formData.get("message") || ""),
      endsAt: new Date(Date.now() + hours * 3600000),
      untilAcknowledged: formData.get("untilAcknowledged") === "on",
      createdById: actor.id
    }
  });
  return { success: "Message published." };
}

export async function updatePasswordPolicyAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerSettings")) return { error: "You do not have permission." };
  if (!await verifyReauthentication(actor, String(formData.get("reauthPassword") || ""), "Change password policy")) return { error: "Confirm your current password before changing the password policy." };
  const policy = normalisePasswordPolicy({ minLength: Number(formData.get("minLength") || 8), requireSpecial: formData.get("requireSpecial") === "on" });
  await prisma.passwordPolicy.upsert({
    where: { tenantId: actor.tenantId },
    update: { minLength: policy.minLength, requireUppercase: policy.requireUppercase, requireLowercase: policy.requireLowercase, requireNumber: policy.requireNumber, requireLetter: policy.requireLetter, requireSpecial: policy.requireSpecial },
    create: { tenantId: actor.tenantId, minLength: policy.minLength, requireUppercase: policy.requireUppercase, requireLowercase: policy.requireLowercase, requireNumber: policy.requireNumber, requireLetter: policy.requireLetter, requireSpecial: policy.requireSpecial }
  });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "PASSWORD_POLICY_UPDATED", entityType: "PasswordPolicy", after: policy });
  return { success: "Password policy updated." };
}

export async function handoverResetAction() {
  const actor = await requireAxiomAdmin();
  await prisma.globalMessageAcknowledgement.deleteMany({ where: { userId: actor.id } });
  await prisma.user.updateMany({ where: { tenantId: actor.tenantId }, data: { walkthroughCompletedAt: null } });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "HANDOVER_RESET", entityType: "Tenant", reason: "Axiom Admin reset walkthrough/demo state" });
  return { success: "Handover reset completed." };
}



function normaliseImportPermissions(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const permissions: Record<string, boolean> = {};
  for (const key of permissionKeys) {
    const rawValue = (value as Record<string, unknown>)[key];
    permissions[key] = rawValue === true;
  }
  permissions.manageAxiomControls = false;
  return permissions;
}

function roleFromImportLabel(value: string): UserRole | null {
  if (value === "View Only") return "VIEW_ONLY";
  if (value === "Super User") return "SUPER_USER";
  if (value === "Admin") return "CUSTOMER_ADMIN";
  return null;
}

function normaliseYesNo(value: string): boolean | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (v === "Y") return true;
  if (v === "N") return false;
  return null;
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export async function previewUserImportAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return { error: "You do not have permission." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel .xlsx file to upload." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "The import file must be an Excel .xlsx file." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseUserImportWorkbook(buffer);
  const emails = rows.map((row) => String(row.Email || "").trim().toLowerCase()).filter(Boolean);
  const existingUsers = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
  const existingEmailSet = new Set(existingUsers.map((user) => user.email.toLowerCase()));
  const seenEmailSet = new Set<string>();

  const batch = await prisma.userImportBatch.create({
    data: {
      tenantId: actor.tenantId,
      fileName: file.name,
      createdById: actor.id
    }
  });

  let skippedCount = 0;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const firstName = String(row["First name"] || "").trim();
    const surname = String(row.Surname || "").trim();
    const email = String(row.Email || "").trim().toLowerCase();
    const roleLabel = String(row.Role || "").trim();
    const role = roleFromImportLabel(roleLabel);
    const errors: string[] = [];

    if (!firstName) errors.push("First name is required");
    if (!surname) errors.push("Surname is required");
    if (!email) errors.push("Email is required");
    else if (!isValidEmail(email)) errors.push("Email address is not valid");
    else if (existingEmailSet.has(email)) errors.push("Email address already exists");
    else if (seenEmailSet.has(email)) errors.push("Email address is duplicated in this import file");
    if (!role) errors.push("Role must be exactly View Only, Super User, or Admin");

    if (email) seenEmailSet.add(email);

    const basePermissions = role ? await getRoleTemplatePermissions(actor.tenantId, role) : {};
    const permissions = { ...basePermissions } as Record<string, boolean>;

    if (role) {
      for (const [column, key] of Object.entries(importPermissionColumnMap)) {
        if (Object.prototype.hasOwnProperty.call(row, column) && String(row[column] || "").trim()) {
          const yesNo = normaliseYesNo(String(row[column] || ""));
          if (yesNo === null) errors.push(`${column} must be Y or N`);
          else permissions[key] = yesNo;
        }
      }
    }

    permissions.manageAxiomControls = false;
    const isValid = errors.length === 0;
    if (!isValid) skippedCount += 1;

    await prisma.userImportRow.create({
      data: {
        batchId: batch.id,
        rowNumber,
        firstName: firstName || null,
        surname: surname || null,
        email: email || null,
        roleLabel: roleLabel || null,
        role: role || null,
        permissions,
        isValid,
        error: errors.join("; ") || null
      }
    });
  }

  await prisma.userImportBatch.update({ where: { id: batch.id }, data: { skippedCount } });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "USER_IMPORT_PREVIEW_CREATED", entityType: "UserImportBatch", entityId: batch.id, after: { rows: rows.length, skippedCount } });
  redirect(`/admin/users/import/${batch.id}`);
}

export async function confirmUserImportAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "manageCustomerUsers")) return { error: "You do not have permission." };
  const batchId = String(formData.get("batchId") || "");
  const batch = await prisma.userImportBatch.findFirst({ where: { id: batchId, tenantId: actor.tenantId }, include: { rows: true } });
  if (!batch) return { error: "Import batch not found." };
  if (batch.status === "COMPLETED") return { error: "This import has already been completed." };

  let importedCount = 0;
  let inviteSentCount = 0;

  for (const row of batch.rows.filter((candidate) => candidate.isValid)) {
    if (!row.email || !row.firstName || !row.surname || !row.role) continue;
    const existing = await prisma.user.findUnique({ where: { email: row.email } });
    if (existing) {
      await prisma.userImportRow.update({ where: { id: row.id }, data: { isValid: false, error: "Email address already exists" } });
      continue;
    }

    const user = await prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email: row.email,
        firstName: row.firstName,
        surname: row.surname,
        role: row.role,
        permissions: normaliseImportPermissions(row.permissions) || await getRoleTemplatePermissions(actor.tenantId, row.role),
        passwordHash: null,
        isActive: false,
        forcePasswordChange: false,
        invitedAt: new Date()
      }
    });
    importedCount += 1;

    const token = randomToken(32);
    const inviteUrl = getAppUrl(`/set-password?token=${encodeURIComponent(token)}`);
    await prisma.userInvite.create({
      data: {
        tenantId: actor.tenantId,
        userId: user.id,
        email: user.email,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 24 * 3600000),
        createdById: actor.id
      }
    });
    await sendEmail({
      tenantId: actor.tenantId,
      requestedById: actor.id,
      to: user.email,
      notificationType: "user_invite",
      subject: "Set up your Axiom app account",
      html: `<p>You have been invited to use the app.</p><p>This link is valid for 24 hours or until it has been used:</p><p><a href="${inviteUrl}">Set your password</a></p>`
    });
    inviteSentCount += 1;
    await prisma.userImportRow.update({ where: { id: row.id }, data: { importedUserId: user.id, inviteSentAt: new Date() } });
  }

  const skippedCount = await prisma.userImportRow.count({ where: { batchId: batch.id, isValid: false } });
  await prisma.userImportBatch.update({
    where: { id: batch.id },
    data: { status: "COMPLETED", importedCount, inviteSentCount, skippedCount, confirmedAt: new Date() }
  });
  await audit({ tenantId: actor.tenantId, userId: actor.id, action: "USER_IMPORT_CONFIRMED", entityType: "UserImportBatch", entityId: batch.id, after: { importedCount, inviteSentCount, skippedCount } });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/import/${batch.id}`);
  return { success: "Import completed." };
}
