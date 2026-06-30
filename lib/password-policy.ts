import type { PasswordPolicy as PasswordPolicyModel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { axiomMinimumPasswordPolicy, type PasswordPolicy } from "@/lib/password";

export function normalisePasswordPolicy(policy?: Partial<PasswordPolicyModel> | null): PasswordPolicy {
  return {
    minLength: Math.max(axiomMinimumPasswordPolicy.minLength, Number(policy?.minLength || axiomMinimumPasswordPolicy.minLength)),
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireLetter: true,
    requireSpecial: Boolean(policy?.requireSpecial || axiomMinimumPasswordPolicy.requireSpecial)
  };
}

export async function getTenantPasswordPolicy(tenantId?: string | null): Promise<PasswordPolicy> {
  if (!tenantId) return axiomMinimumPasswordPolicy;
  const policy = await prisma.passwordPolicy.findUnique({ where: { tenantId } });
  return normalisePasswordPolicy(policy);
}
