import bcrypt from "bcryptjs";
import type { TenantBoundUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function verifyReauthentication(user: TenantBoundUser, password: string, action: string) {
  const ok = Boolean(user.passwordHash && password && await bcrypt.compare(password, user.passwordHash));
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: ok ? "REAUTH_PASSED" : "REAUTH_FAILED",
    entityType: "User",
    reason: action
  });
  return ok;
}
