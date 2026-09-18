"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import {
  deleteOutputProfileForTenant,
  duplicateOutputProfileForTenant,
  saveOutputProfileForTenant,
  OutputProfileNotFoundError
} from "@/lib/data-mapper/output-profiles/repository";
import type { OutputProfileMutationResult, SaveOutputProfileInput, SaveOutputProfileResult } from "@/lib/data-mapper/output-profiles/types";
import { OutputProfileValidationError } from "@/lib/data-mapper/output-profiles/validation";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function saveOutputProfileAction(input: SaveOutputProfileInput): Promise<SaveOutputProfileResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to edit Output Profiles." };
  if (input.projectId && input.id) return { ok: false, error: "Save Project-specific changes as a new Output Profile." };

  try {
    const profile = await prisma.$transaction(async (transaction) => {
      const project = input.projectId
        ? await transaction.project.findFirst({ where: { id: input.projectId, tenantId: actor.tenantId, sourceWorkbookImports: { some: { id: input.sourceWorkbookImportId, tenantId: actor.tenantId, worksheets: { some: { id: input.sourceWorksheetId } } } } }, select: { id: true } })
        : null;
      if (input.projectId && !project) throw new OutputProfileNotFoundError("The Project workbook is not available.");
      const savedProfile = await saveOutputProfileForTenant(transaction, actor, input);
      if (project) {
        await transaction.projectOutputProfile.upsert({ where: { projectId_outputProfileId: { projectId: project.id, outputProfileId: savedProfile.id } }, create: { tenantId: actor.tenantId, projectId: project.id, outputProfileId: savedProfile.id, createdById: actor.id }, update: {} });
        await transaction.project.update({ where: { id: project.id }, data: { updatedById: actor.id } });
      }
      return savedProfile;
    });
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: input.id ? "OUTPUT_PROFILE_UPDATED" : "OUTPUT_PROFILE_CREATED",
      entityType: "OutputProfile",
      entityId: profile.id,
      after: {
        name: profile.name,
        outputColumnCount: input.columns.length,
        filterCount: input.filters.length,
        filterMatchMode: input.filterMatchMode,
        outputFormat: input.outputFormat
      }
    });
    revalidatePath("/mapping");
    if (input.projectId) revalidatePath(`/projects/${input.projectId}`);
    return { ok: true, profileId: profile.id, message: "Output Profile saved." };
  } catch (error) {
    if (error instanceof OutputProfileValidationError || error instanceof OutputProfileNotFoundError) {
      return { ok: false, error: error.message };
    }
    console.error("[Pricebook Manager] Output Profile save failed", error);
    return { ok: false, error: "The Output Profile could not be saved. Please try again." };
  }
}

export async function saveOutputProfileAsNewAction(originalProfileId: string, input: SaveOutputProfileInput): Promise<SaveOutputProfileResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to create Output Profiles." };
  if (typeof originalProfileId !== "string" || !originalProfileId || originalProfileId.length > 100 || input.projectId) {
    return { ok: false, error: "The Output Profile is not available." };
  }
  try {
    const profile = await prisma.$transaction(async (transaction) => {
      const original = await transaction.outputProfile.findFirst({
        where: { id: originalProfileId, tenantId: actor.tenantId, sourceWorkbookImport: { tenantId: actor.tenantId } },
        select: { id: true, name: true, sourceWorkbookImportId: true, sourceWorksheetId: true }
      });
      const nextName = typeof input.name === "string" ? input.name.trim() : "";
      if (!original || original.sourceWorkbookImportId !== input.sourceWorkbookImportId || original.sourceWorksheetId !== input.sourceWorksheetId) {
        throw new OutputProfileNotFoundError("The Output Profile is not available.");
      }
      if (!nextName || nextName.localeCompare(original.name.trim(), "en-GB", { sensitivity: "accent" }) === 0) {
        throw new OutputProfileValidationError("Enter a new Output Profile name that differs from the current profile.");
      }
      const duplicateName = await transaction.outputProfile.findFirst({
        where: { tenantId: actor.tenantId, name: { equals: nextName, mode: "insensitive" } },
        select: { id: true }
      });
      if (duplicateName) throw new OutputProfileValidationError("An Output Profile with this name already exists. Choose a different name.");
      return saveOutputProfileForTenant(transaction, actor, { ...input, id: null, projectId: undefined, name: nextName });
    });
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "OUTPUT_PROFILE_CREATED",
      entityType: "OutputProfile",
      entityId: profile.id,
      after: { name: profile.name, savedAsNewFromId: originalProfileId, outputColumnCount: input.columns.length, filterCount: input.filters.length }
    });
    revalidatePath("/mapping");
    return { ok: true, profileId: profile.id, message: "New Output Profile saved." };
  } catch (error) {
    if (error instanceof OutputProfileValidationError || error instanceof OutputProfileNotFoundError) return { ok: false, error: error.message };
    console.error("[Pricebook Manager] Save Output Profile as new failed", error);
    return { ok: false, error: "The new Output Profile could not be saved. Please try again." };
  }
}

export async function associateOutputProfileWithProjectAction(input: {
  projectId: string;
  outputProfileId: string;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
}): Promise<OutputProfileMutationResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to apply Output Profiles." };
  if (!input || [input.projectId, input.outputProfileId, input.sourceWorkbookImportId, input.sourceWorksheetId].some((value) => typeof value !== "string" || !value || value.length > 100)) {
    return { ok: false, error: "The Project or Output Profile is not available." };
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const [project, profile] = await Promise.all([
        transaction.project.findFirst({
          where: {
            id: input.projectId,
            tenantId: actor.tenantId,
            sourceWorkbookImports: { some: { id: input.sourceWorkbookImportId, tenantId: actor.tenantId, worksheets: { some: { id: input.sourceWorksheetId } } } }
          },
          select: { id: true }
        }),
        transaction.outputProfile.findFirst({
          where: { id: input.outputProfileId, tenantId: actor.tenantId, sourceWorkbookImport: { tenantId: actor.tenantId } },
          select: { id: true, name: true }
        })
      ]);
      if (!project || !profile) throw new OutputProfileNotFoundError("The Project or Output Profile is not available.");
      const existing = await transaction.projectOutputProfile.findUnique({
        where: { projectId_outputProfileId: { projectId: project.id, outputProfileId: profile.id } },
        select: { id: true }
      });
      const association = existing ?? await transaction.projectOutputProfile.create({
        data: { tenantId: actor.tenantId, projectId: project.id, outputProfileId: profile.id, createdById: actor.id },
        select: { id: true }
      });
      if (!existing) await transaction.project.update({ where: { id: project.id }, data: { updatedById: actor.id } });
      return { profile, association, created: !existing };
    });
    if (result.created) {
      await audit({
        tenantId: actor.tenantId,
        userId: actor.id,
        action: "PROJECT_OUTPUT_PROFILE_ASSOCIATED",
        entityType: "ProjectOutputProfile",
        entityId: result.association.id,
        after: { projectId: input.projectId, outputProfileId: input.outputProfileId }
      });
    }
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/mapping");
    return { ok: true, profileId: result.profile.id, message: result.created ? "Output Profile added to Project." : "Output Profile is already used in this Project." };
  } catch (error) {
    if (error instanceof OutputProfileNotFoundError) return { ok: false, error: error.message };
    console.error("[Pricebook Manager] Project Output Profile association failed", error);
    return { ok: false, error: "The Project or Output Profile is not available." };
  }
}

export async function duplicateOutputProfileAction(profileId: string, projectId?: string): Promise<OutputProfileMutationResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to duplicate Output Profiles." };
  if (typeof profileId !== "string" || !profileId.trim() || profileId.length > 100) return { ok: false, error: "The Output Profile is not available." };
  if (projectId !== undefined && (typeof projectId !== "string" || !projectId.trim() || projectId.length > 100)) return { ok: false, error: "The Project or Output Profile is not available." };

  try {
    const duplicate = await prisma.$transaction(async (transaction) => {
      if (projectId) {
        const association = await transaction.projectOutputProfile.findFirst({
          where: {
            tenantId: actor.tenantId,
            projectId,
            outputProfileId: profileId,
            project: { tenantId: actor.tenantId },
            outputProfile: { tenantId: actor.tenantId, sourceWorkbookImport: { tenantId: actor.tenantId } }
          },
          select: { projectId: true }
        });
        if (!association) throw new OutputProfileNotFoundError("The Project or Output Profile is not available.");
      }

      const result = await duplicateOutputProfileForTenant(transaction, actor, profileId);
      if (projectId) {
        await transaction.projectOutputProfile.create({
          data: { tenantId: actor.tenantId, projectId, outputProfileId: result.id, createdById: actor.id }
        });
        await transaction.project.update({ where: { id: projectId }, data: { updatedById: actor.id } });
      }
      return result;
    });
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "OUTPUT_PROFILE_DUPLICATED",
      entityType: "OutputProfile",
      entityId: duplicate.id,
      after: { name: duplicate.name, duplicatedFromId: profileId }
    });
    revalidatePath("/mapping");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true, profileId: duplicate.id, message: "Output Profile duplicated." };
  } catch (error) {
    if (error instanceof OutputProfileValidationError || error instanceof OutputProfileNotFoundError) return { ok: false, error: error.message };
    console.error("[Pricebook Manager] Output Profile duplication failed", error);
    return { ok: false, error: "The Output Profile could not be duplicated. Please try again." };
  }
}

export async function deleteOutputProfileAction(profileId: string): Promise<OutputProfileMutationResult> {
  const actor = await requireUser();
  if (!hasPermission(actor, "editRecords")) return { ok: false, error: "You do not have permission to delete Output Profiles." };
  if (typeof profileId !== "string" || !profileId.trim() || profileId.length > 100) return { ok: false, error: "The Output Profile is not available." };

  try {
    const deleted = await deleteOutputProfileForTenant(prisma, actor.tenantId, profileId);
    await audit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "OUTPUT_PROFILE_DELETED",
      entityType: "OutputProfile",
      entityId: deleted.id,
      before: { name: deleted.name, sourceWorkbookImportId: deleted.sourceWorkbookImportId, sourceWorksheetId: deleted.sourceWorksheetId }
    });
    revalidatePath("/mapping");
    return { ok: true, profileId: deleted.id, message: "Output Profile deleted." };
  } catch (error) {
    if (error instanceof OutputProfileNotFoundError) return { ok: false, error: error.message };
    console.error("[Pricebook Manager] Output Profile deletion failed", error);
    return { ok: false, error: "The Output Profile could not be deleted. Please try again." };
  }
}
