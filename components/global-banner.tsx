import { prisma } from "@/lib/prisma";
export async function GlobalBanner({tenantId}:{tenantId?:string|null}){ if(!tenantId) return null; const messages=await prisma.globalMessage.findMany({where:{tenantId,isActive:true},take:2,orderBy:{createdAt:"desc"}}); return <>{messages.map((m)=><div className="globalBanner" key={m.id}>{m.message}</div>)}</>; }
