import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureDefaultEmailSetup } from "../lib/email";
const prisma = new PrismaClient();
async function main(){
 const tenant = await prisma.tenant.upsert({ where:{slug:"demo-customer"}, update:{}, create:{name:"Demo Customer", slug:"demo-customer"} });
 await ensureDefaultEmailSetup(tenant.id);
 const pwd = await bcrypt.hash("DemoPass123",12);
 for (const user of [
  {email:"customer.admin@example.com",firstName:"Customer",surname:"Admin",role:UserRole.CUSTOMER_ADMIN},
  {email:"super.user@example.com",firstName:"Super",surname:"User",role:UserRole.SUPER_USER},
  {email:"view.only@example.com",firstName:"View",surname:"Only",role:UserRole.VIEW_ONLY}
 ]) { await prisma.user.upsert({ where:{email:user.email}, update:{}, create:{tenantId:tenant.id,...user,passwordHash:pwd,forcePasswordChange:true} }); }
 for (const title of ["Demo onboarding workflow", "Demo document approval", "Demo customer record"]) { await prisma.sampleRecord.create({ data:{tenantId:tenant.id,title,description:"Reusable sample record for demonstrations."} }); }
 await prisma.passwordPolicy.upsert({ where:{tenantId:tenant.id}, update:{}, create:{tenantId:tenant.id,minLength:8,requireUppercase:true,requireLowercase:true,requireNumber:true,requireLetter:true} });
}
main().finally(async()=>prisma.$disconnect());
