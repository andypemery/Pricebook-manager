import type { User, UserRole } from "@prisma/client";
import { rolePresets, type PermissionKey } from "@/config/permissions.config";
export function hasPermission(user: Pick<User,"role"|"permissions">, permission: PermissionKey){ if(user.role==="AXIOM_ADMIN") return true; const preset=rolePresets[user.role as UserRole] ?? []; const overrides=user.permissions; if(overrides && typeof overrides==="object" && !Array.isArray(overrides) && permission in overrides) return Boolean((overrides as Record<string,unknown>)[permission]); return preset.includes(permission); }
export function isAxiomAdmin(role: UserRole){ return role === "AXIOM_ADMIN"; }
export function isCustomerAdmin(role: UserRole){ return role === "CUSTOMER_ADMIN"; }
