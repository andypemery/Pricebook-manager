import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveOutputProfileInput } from "../lib/data-mapper/output-profiles/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  saveProfile: vi.fn(),
  duplicateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  projectFindFirst: vi.fn(),
  projectUpdate: vi.fn(),
  associationUpsert: vi.fn(),
  transactionAssociationFindFirst: vi.fn(),
  transactionAssociationCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/data-mapper/output-profiles/repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/data-mapper/output-profiles/repository")>();
  return {
    ...original,
    saveOutputProfileForTenant: mocks.saveProfile,
    duplicateOutputProfileForTenant: mocks.duplicateProfile,
    deleteOutputProfileForTenant: mocks.deleteProfile
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst },
    projectOutputProfile: { upsert: mocks.associationUpsert },
    $transaction: mocks.transaction
  }
}));

import { duplicateOutputProfileAction, saveOutputProfileAction } from "../lib/actions/output-profile.actions";

const actor = { id: "user-1", tenantId: "tenant-1", role: "SUPER_USER", permissions: {} };
const input: SaveOutputProfileInput = {
  projectId: "project-1",
  name: "NHS Contract",
  filenameTemplate: "{profile}_{date}",
  outputFormat: "CSV",
  csvDelimiter: "COMMA",
  csvIncludeHeader: true,
  xlsxWorksheetName: "",
  sourceWorkbookImportId: "source-1",
  sourceWorksheetId: "worksheet-1",
  columns: [{ columnType: "SOURCE", sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null }],
  filterMatchMode: "ALL",
  filters: []
};

describe("Project-aware Output Profile mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(actor);
    mocks.projectFindFirst.mockResolvedValue({ id: "project-1" });
    mocks.saveProfile.mockResolvedValue({ id: "profile-new", name: "NHS Contract", updatedAt: new Date() });
    mocks.associationUpsert.mockResolvedValue({ id: "association-new" });
    mocks.transactionAssociationFindFirst.mockResolvedValue({ projectId: "project-1" });
    mocks.transactionAssociationCreate.mockResolvedValue({ id: "association-copy" });
    mocks.duplicateProfile.mockResolvedValue({ id: "profile-copy", name: "NHS Contract - Copy", updatedAt: new Date() });
    mocks.transaction.mockImplementation(async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      project: { findFirst: mocks.projectFindFirst, update: mocks.projectUpdate },
      projectOutputProfile: {
        findFirst: mocks.transactionAssociationFindFirst,
        create: mocks.transactionAssociationCreate,
        upsert: mocks.associationUpsert
      }
    }));
  });

  it("auto-associates a newly saved reusable profile after validating Project/source/worksheet ownership", async () => {
    await expect(saveOutputProfileAction(input)).resolves.toEqual({ ok: true, profileId: "profile-new", message: "Output Profile saved." });

    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: "project-1", tenantId: "tenant-1", sourceWorkbookImports: { some: { id: "source-1", tenantId: "tenant-1", worksheets: { some: { id: "worksheet-1" } } } } },
      select: { id: true }
    });
    expect(mocks.associationUpsert).toHaveBeenCalledWith({
      where: { projectId_outputProfileId: { projectId: "project-1", outputProfileId: "profile-new" } },
      create: { tenantId: "tenant-1", projectId: "project-1", outputProfileId: "profile-new", createdById: "user-1" },
      update: {}
    });
  });

  it("rejects a mismatched Project/source context before saving the master", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    await expect(saveOutputProfileAction(input)).resolves.toEqual({ ok: false, error: "The Project workbook is not available." });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    expect(mocks.associationUpsert).not.toHaveBeenCalled();
  });

  it("does not allow Project context to overwrite a reusable master", async () => {
    await expect(saveOutputProfileAction({ ...input, id: "profile-1" })).resolves.toEqual({ ok: false, error: "Save Project-specific changes as a new Output Profile." });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it("duplicates and associates only within the current Project transaction", async () => {
    await expect(duplicateOutputProfileAction("profile-1", "project-1")).resolves.toEqual({ ok: true, profileId: "profile-copy", message: "Output Profile duplicated." });

    expect(mocks.transactionAssociationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", outputProfileId: "profile-1" })
    }));
    expect(mocks.transactionAssociationCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", projectId: "project-1", outputProfileId: "profile-copy", createdById: "user-1" }
    });
    expect(mocks.transactionAssociationCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-tenant or unattached Project duplicate context without creating a profile", async () => {
    mocks.transactionAssociationFindFirst.mockResolvedValueOnce(null);
    await expect(duplicateOutputProfileAction("profile-1", "tenant-2-project")).resolves.toEqual({ ok: false, error: "The Project or Output Profile is not available." });
    expect(mocks.duplicateProfile).not.toHaveBeenCalled();
    expect(mocks.transactionAssociationCreate).not.toHaveBeenCalled();
  });

  it("keeps library-master duplication independent from Project associations", async () => {
    await expect(duplicateOutputProfileAction("profile-1")).resolves.toEqual({ ok: true, profileId: "profile-copy", message: "Output Profile duplicated." });
    expect(mocks.transactionAssociationFindFirst).not.toHaveBeenCalled();
    expect(mocks.transactionAssociationCreate).not.toHaveBeenCalled();
  });
});
