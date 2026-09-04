import { UserRole, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

type AxiomAdminBootstrapClient = Pick<PrismaClient, "user">;

type SeededAxiomAdminOptions = {
  email: string;
  seedPassword: string;
  tenantId: string;
};

export type SeededAxiomAdminResult = "created" | "confirmed" | "recovered";

export async function ensureSeededAxiomAdmin(
  prisma: AxiomAdminBootstrapClient,
  { email, seedPassword, tenantId }: SeededAxiomAdminOptions
): Promise<SeededAxiomAdminResult> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      tenantId: true,
      passwordHash: true,
      forcePasswordChange: true
    }
  });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        tenantId,
        email,
        firstName: "Andy",
        surname: "Emery",
        role: UserRole.AXIOM_ADMIN,
        passwordHash: await bcrypt.hash(seedPassword, 12),
        forcePasswordChange: false,
        mfaRequired: false
      }
    });
    return "created";
  }

  const hasBootstrapPassword = Boolean(
    existingUser.forcePasswordChange
    && existingUser.passwordHash
    && await bcrypt.compare(seedPassword, existingUser.passwordHash)
  );

  await prisma.user.update({
    where: { email },
    data: {
      tenantId: existingUser.tenantId || tenantId,
      role: UserRole.AXIOM_ADMIN,
      isActive: true,
      ...(hasBootstrapPassword ? { forcePasswordChange: false } : {})
    }
  });

  return hasBootstrapPassword ? "recovered" : "confirmed";
}
