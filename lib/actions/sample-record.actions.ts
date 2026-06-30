"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
export async function createSampleRecord(formData:FormData){ const user=await requireUser(); if(!hasPermission(user,"createRecords")) return {error:"You do not have permission."}; const title=String(formData.get("title")||"").trim(); if(!title) return {error:"Title is required."}; const record=await prisma.sampleRecord.create({data:{tenantId:user.tenantId!,title,description:String(formData.get("description")||""),createdById:user.id,updatedById:user.id}}); await audit({tenantId:user.tenantId,userId:user.id,action:"CREATE",entityType:"SampleRecord",entityId:record.id}); redirect(`/sample-records/${record.id}`); }
export async function updateSampleRecord(id:string, formData:FormData){ const user=await requireUser(); if(!hasPermission(user,"editRecords")) return {error:"You do not have permission."}; const record=await prisma.sampleRecord.findFirst({where:{id,tenantId:user.tenantId}}); if(!record) return {error:"Record not found."}; await prisma.sampleRecord.update({where:{id},data:{title:String(formData.get("title")||record.title),status:String(formData.get("status")||record.status),description:String(formData.get("description")||""),updatedById:user.id}}); redirect(`/sample-records/${id}`); }
export async function archiveSampleRecord(id:string){ const user=await requireUser(); if(!hasPermission(user,"archiveRecords")) return {error:"You do not have permission."}; await prisma.sampleRecord.update({where:{id},data:{archivedAt:new Date(),updatedById:user.id}}); redirect("/sample-records"); }
