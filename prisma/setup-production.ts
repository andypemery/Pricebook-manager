import { PrismaClient } from "@prisma/client";
import { validatePassword } from "../lib/password";
import { backfillDefaultEmailSetup, ensureDefaultEmailSetup } from "../lib/email";
import { requireProductionHttpsAppUrl } from "../lib/app-url";
import { axiomDefaults } from "../config/axiom-defaults";
import { ensureSeededAxiomAdmin } from "../lib/axiom-admin-bootstrap";
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
  const adminResult = await ensureSeededAxiomAdmin(prisma, { email, seedPassword: tempPassword, tenantId: tenant.id });
  console.log(`${adminResult === "created" ? "Created" : adminResult === "recovered" ? "Recovered" : "Confirmed"} Axiom Admin user: ${email}`);
  await ensureDefaultEmailSetup(tenant.id);
  console.log("Confirmed standard Axiom email defaults.");
  await prisma.backupStatus.upsert({ where: { tenantId_backupType: { tenantId: tenant.id, backupType: "database" } }, update: {}, create: { tenantId: tenant.id, backupType: "database", status: "FRAMEWORK_ONLY" } });
  await prisma.backupStatus.upsert({ where: { tenantId_backupType: { tenantId: tenant.id, backupType: "blob" } }, update: {}, create: { tenantId: tenant.id, backupType: "blob", status: "FRAMEWORK_ONLY" } });
  await backfillDefaultEmailSetup();
  console.log("Backfilled standard email setup for existing tenants where missing.");
}
main().finally(async()=>prisma.$disconnect());
