import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export async function audit(args:{tenantId?:string|null; userId?:string|null; action:string; entityType:string; entityId?:string|null; before?:Prisma.InputJsonValue; after?:Prisma.InputJsonValue; reason?:string}){
  await prisma.auditLog.create({data:{tenantId:args.tenantId??null,userId:args.userId??null,action:args.action,entityType:args.entityType,entityId:args.entityId??null,before:args.before??undefined,after:args.after??undefined,reason:args.reason}});
}
