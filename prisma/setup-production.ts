import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validatePassword } from "../lib/password";
import { backfillDefaultEmailSetup, ensureDefaultEmailSetup } from "../lib/email";
import { requireProductionHttpsAppUrl } from "../lib/app-url";
import { axiomDefaults } from "../config/axiom-defaults";
const prisma = new PrismaClient();
async function main() {
  requireProductionHttpsAppUrl();
  const email = (process.env.AXIOM_ADMIN_EMAIL || axiomDefaults.adminEmail).toLowerCase();
  const tempPassword = process.env.AXIOM_ADMIN_TEMP_PASSWORD;
  if (!tempPassword) throw new Error("AXIOM_ADMIN_TEMP_PASSWORD is required");
  const policy = { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireLetter: true, requireSpecial: false };
  const result = validatePassword(tempPassword, policy);
  if (!result.ok) throw new Error(`AXIOM_ADMIN_TEMP_PASSWORD is too weak: ${result.errors.join(", ")}`);
  const tenant = await prisma.tenant.upsert({ where: { slug: "axiom-internal" }, update: { name: "Axiom Internal", status: "ACTIVE" }, create: { name: "Axiom Internal", slug: "axiom-internal" } });
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    await prisma.user.update({ where: { email }, data: { tenantId: existingUser.tenantId || tenant.id, role: UserRole.AXIOM_ADMIN, isActive: true, forcePasswordChange: true } });
    console.log(`Confirmed Axiom Admin user: ${email}`);
  } else {
    await prisma.user.create({ data: { tenantId: tenant.id, email, firstName: "Andy", surname: "Emery", role: UserRole.AXIOM_ADMIN, passwordHash: await bcrypt.hash(tempPassword, 12), forcePasswordChange: true, mfaRequired: false } });
    console.log(`Created Axiom Admin user: ${email}`);
  }
  await ensureDefaultEmailSetup(tenant.id);
  console.log("Confirmed standard Axiom email defaults.");
  await prisma.backupStatus.upsert({ where: { tenantId_backupType: { tenantId: tenant.id, backupType: "database" } }, update: {}, create: { tenantId: tenant.id, backupType: "database", status: "FRAMEWORK_ONLY" } });
  await prisma.backupStatus.upsert({ where: { tenantId_backupType: { tenantId: tenant.id, backupType: "blob" } }, update: {}, create: { tenantId: tenant.id, backupType: "blob", status: "FRAMEWORK_ONLY" } });
  await backfillDefaultEmailSetup();
  console.log("Backfilled standard email setup for existing tenants where missing.");
}
main().finally(async()=>prisma.$disconnect());
