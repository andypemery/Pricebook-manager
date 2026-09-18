import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  audit: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  projectCreate: vi.fn(),
  projectFindFirst: vi.fn(),
  projectUpdate: vi.fn(),
  outputProfileFindFirst: vi.fn(),
  associationUpsert: vi.fn(),
  associationFindFirst: vi.fn(),
  associationDelete: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { create: mocks.projectCreate, findFirst: mocks.projectFindFirst, update: mocks.projectUpdate },
    outputProfile: { findFirst: mocks.outputProfileFindFirst },
    projectOutputProfile: { upsert: mocks.associationUpsert, findFirst: mocks.associationFindFirst, delete: mocks.associationDelete }
  }
}));

import {
  attachOutputProfileToProjectAction,
  createProjectAction,
  removeOutputProfileFromProjectAction,
  renameProjectAction
} from "../lib/actions/project.actions";

const editor = { id: "user-1", tenantId: "tenant-1", role: "SUPER_USER", permissions: {} };

describe("Project actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(editor);
  });

  it("creates a tenant-owned Project, audits it and redirects only after persistence", async () => {
    mocks.projectCreate.mockResolvedValue({ id: "project-1", name: "September HP Pricebook" });
    const form = new FormData();
    form.set("name", "  September HP Pricebook  ");

    await createProjectAction(form);

    expect(mocks.projectCreate).toHaveBeenCalledWith({ data: { tenantId: "tenant-1", name: "September HP Pricebook", createdById: "user-1", updatedById: "user-1" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "PROJECT_CREATED", entityId: "project-1", tenantId: "tenant-1" }));
    expect(mocks.redirect).toHaveBeenCalledWith("/projects/project-1");
  });

  it("rejects blank names and create attempts without permission", async () => {
    const blank = new FormData();
    blank.set("name", "   ");
    await expect(createProjectAction(blank)).resolves.toEqual({ error: "Project name is required." });
    expect(mocks.projectCreate).not.toHaveBeenCalled();

    mocks.requireUser.mockResolvedValueOnce({ ...editor, role: "VIEW_ONLY" });
    const named = new FormData();
    named.set("name", "Blocked");
    await expect(createProjectAction(named)).resolves.toEqual({ error: "You do not have permission to create Projects." });
    expect(mocks.projectCreate).not.toHaveBeenCalled();
  });

  it("renames only a Project found in the authenticated tenant", async () => {
    const form = new FormData();
    form.set("name", "Renamed Project");
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "project-1", name: "Old Project" });
    mocks.projectUpdate.mockResolvedValueOnce({ id: "project-1" });

    await expect(renameProjectAction("project-1", form)).resolves.toEqual({ ok: true });
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({ where: { id: "project-1", tenantId: "tenant-1" }, select: { id: true, name: true } });
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ where: { id: "project-1" }, data: { name: "Renamed Project", updatedById: "user-1" } });

    mocks.projectFindFirst.mockResolvedValueOnce(null);
    await expect(renameProjectAction("tenant-2-project", form)).resolves.toEqual({ error: "The Project is not available." });
  });

  it("idempotently associates same-tenant reusable profiles and supports many-to-many use", async () => {
    mocks.projectFindFirst.mockImplementation(async (args: { where: { id: string } }) => ({ id: args.where.id }));
    mocks.outputProfileFindFirst.mockResolvedValue({ id: "profile-1", name: "NHS Contract" });
    mocks.associationUpsert.mockResolvedValue({ id: "association-1" });

    await expect(attachOutputProfileToProjectAction("project-1", "profile-1")).resolves.toEqual({ ok: true });
    await expect(attachOutputProfileToProjectAction("project-1", "profile-1")).resolves.toEqual({ ok: true });
    await expect(attachOutputProfileToProjectAction("project-2", "profile-1")).resolves.toEqual({ ok: true });

    expect(mocks.associationUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId_outputProfileId: { projectId: "project-1", outputProfileId: "profile-1" } } }));
    expect(mocks.associationUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ where: { projectId_outputProfileId: { projectId: "project-2", outputProfileId: "profile-1" } } }));
    expect(mocks.associationUpsert).toHaveBeenCalledTimes(3);
  });

  it("does not reveal or attach cross-tenant Projects or profiles", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "project-1" });
    mocks.outputProfileFindFirst.mockResolvedValueOnce(null);
    await expect(attachOutputProfileToProjectAction("project-1", "tenant-2-profile")).resolves.toEqual({ error: "The Project or Output Profile is not available." });
    expect(mocks.associationUpsert).not.toHaveBeenCalled();
  });

  it("removes only the Project association and leaves the reusable master untouched", async () => {
    mocks.associationFindFirst.mockResolvedValueOnce({ id: "association-1" });
    mocks.associationDelete.mockResolvedValueOnce({ id: "association-1" });

    await expect(removeOutputProfileFromProjectAction("project-1", "profile-1")).resolves.toEqual({ ok: true });

    expect(mocks.associationFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", outputProfileId: "profile-1" }) }));
    expect(mocks.associationDelete).toHaveBeenCalledWith({ where: { id: "association-1" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "OUTPUT_PROFILE_REMOVED_FROM_PROJECT", before: { outputProfileId: "profile-1" } }));
  });
});
