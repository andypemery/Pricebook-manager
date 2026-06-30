import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Tenant, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/config/auth.config";
import { randomToken, sha256 } from "@/lib/crypto";
export type AuthenticatedUser = User & { tenant: Tenant | null };
export type TenantBoundUser = AuthenticatedUser & { tenantId: string };
export async function getClientInfo(){ const h=await headers(); return { userAgent:h.get("user-agent")??undefined, ipAddress:h.get("x-forwarded-for")?.split(",")[0]?.trim() }; }
export async function createSession(userId:string){ const token=randomToken(32); const expiresAt=new Date(Date.now()+authConfig.sessionDays*86400000); const info=await getClientInfo(); await prisma.session.create({data:{userId,tokenHash:sha256(token),expiresAt,userAgent:info.userAgent,ipAddress:info.ipAddress}}); (await cookies()).set(authConfig.sessionCookieName, token, {httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",expires:expiresAt}); }
export async function getCurrentUser(): Promise<AuthenticatedUser|null>{ const store=await cookies(); const token=store.get(authConfig.sessionCookieName)?.value; if(!token) return null; const session=await prisma.session.findUnique({where:{tokenHash:sha256(token)},include:{user:{include:{tenant:true}}}}); if(!session || session.expiresAt < new Date() || !session.user.isActive){ store.delete(authConfig.sessionCookieName); return null; } return session.user; }
export async function requireUser(options:{allowForcePasswordChange?:boolean}={}): Promise<TenantBoundUser>{ const user=await getCurrentUser(); if(!user) redirect("/login"); if(!user.tenantId) redirect("/unavailable"); if(user.tenant?.status==="SUSPENDED" || user.tenant?.status==="DISABLED") redirect("/unavailable"); if(user.forcePasswordChange && !options.allowForcePasswordChange) redirect("/change-password"); return user as TenantBoundUser; }
export async function requireAxiomAdmin(){ const user=await requireUser(); if(user.role!=="AXIOM_ADMIN") redirect("/dashboard"); return user; }
