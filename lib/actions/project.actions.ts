"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { validateProjectName } from "@/lib/data-mapper/projects/repository";

export async function createProjectAction(formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "createRecords")) return { error: "You do not have permission to create Projects." };
  let name: string;
  try {
    name = validateProjectName(formData.get("name"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Project name is not valid." };
  }
  let projectId: string;
  try {
    const project = await prisma.project.create({ data: { tenantId: actor.tenantId, name, createdById: actor.id, updatedById: actor.id } });
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id, after: { name: project.name } });
    projectId = project.id;
  } catch (error) {
    console.error("[Pricebook Manager] Project creation failed", error instanceof Error ? error.name : "unknown");
    return { error: "The Project could not be created. Please try again." };
  }
  redirect(`/projects/${projectId}`);
}

export async function renameProjectAction(projectId: string, formData: FormData) {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { error: "You do not have permission to rename Projects." };
  let name: string;
  try {
    name = validateProjectName(formData.get("name"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Project name is not valid." };
  }
  try {
    const existing = await prisma.project.findFirst({ where: { id: projectId, tenantId: actor.tenantId }, select: { id: true, name: true } });
    if (!existing) return { error: "The Project is not available." };
    await prisma.project.update({ where: { id: existing.id }, data: { name, updatedById: actor.id } });
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: "PROJECT_RENAMED", entityType: "Project", entityId: existing.id, before: { name: existing.name }, after: { name } });
    revalidatePath(`/projects/${existing.id}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[Pricebook Manager] Project rename failed", error instanceof Error ? error.name : "unknown");
    return { error: "The Project could not be renamed. Please try again." };
  }
}

export async function attachOutputProfileToProjectAction(projectId: string, outputProfileId: string) {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { error: "You do not have permission to attach Output Profiles." };
  if (!projectId || projectId.length > 100 || !outputProfileId || outputProfileId.length > 100) return { error: "The Project or Output Profile is not available." };
  try {
    const [project, profile] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, tenantId: actor.tenantId }, select: { id: true } }),
      prisma.outputProfile.findFirst({ where: { id: outputProfileId, tenantId: actor.tenantId, sourceWorkbookImport: { tenantId: actor.tenantId } }, select: { id: true, name: true } })
    ]);
    if (!project || !profile) return { error: "The Project or Output Profile is not available." };
    await prisma.projectOutputProfile.upsert({ where: { projectId_outputProfileId: { projectId: project.id, outputProfileId: profile.id } }, create: { tenantId: actor.tenantId, projectId: project.id, outputProfileId: profile.id, createdById: actor.id }, update: {} });
    await prisma.project.update({ where: { id: project.id }, data: { updatedById: actor.id } });
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: "OUTPUT_PROFILE_ATTACHED_TO_PROJECT", entityType: "Project", entityId: project.id, after: { outputProfileId: profile.id } });
    revalidatePath(`/projects/${project.id}`);
    return { ok: true };
  } catch (error) {
    console.error("[Pricebook Manager] Project Output Profile attachment failed", error instanceof Error ? error.name : "unknown");
    return { error: "The Output Profile could not be added to the Project. Please try again." };
  }
}

export async function removeOutputProfileFromProjectAction(projectId: string, outputProfileId: string) {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { error: "You do not have permission to remove Output Profiles." };
  if (!projectId || projectId.length > 100 || !outputProfileId || outputProfileId.length > 100) return { error: "The Project Output Profile association is not available." };
  try {
    const association = await prisma.projectOutputProfile.findFirst({ where: { projectId, outputProfileId, tenantId: actor.tenantId, project: { tenantId: actor.tenantId }, outputProfile: { tenantId: actor.tenantId, sourceWorkbookImport: { tenantId: actor.tenantId } } }, select: { id: true } });
    if (!association) return { error: "The Project Output Profile association is not available." };
    await prisma.projectOutputProfile.delete({ where: { id: association.id } });
    await prisma.project.update({ where: { id: projectId }, data: { updatedById: actor.id } });
    await audit({ tenantId: actor.tenantId, userId: actor.id, action: "OUTPUT_PROFILE_REMOVED_FROM_PROJECT", entityType: "Project", entityId: projectId, before: { outputProfileId } });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("[Pricebook Manager] Project Output Profile removal failed", error instanceof Error ? error.name : "unknown");
    return { error: "The Output Profile could not be removed from the Project. Please try again." };
  }
}
