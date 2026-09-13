import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadOutputProfileBuilder, OutputProfileNotFoundError, saveOutputProfileForTenant } from "../lib/data-mapper/output-profiles/repository";
import { OutputProfileValidationError, validateOutputProfileInput } from "../lib/data-mapper/output-profiles/validation";

const actor = { id: "user-1", tenantId: "tenant-1" };

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "NHS Contract",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [
      { sourceColumnIndex: 0, sourceHeading: "Product Code", outputHeading: "MATERIAL" },
      { sourceColumnIndex: 1, sourceHeading: "Description", outputHeading: "DESCRIPTION" }
    ],
    ...overrides
  };
}

describe("Output Profile persistence", () => {
  it("creates a tenant-owned profile with compact ordered column definitions", async () => {
    const create = vi.fn().mockResolvedValue({ id: "profile-1", name: "NHS Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "Description"] }) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    const result = await saveOutputProfileForTenant(db, actor, profileInput());

    expect(result.id).toBe("profile-1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        createdById: "user-1",
        columns: { create: [
          expect.objectContaining({ position: 0, sourceHeading: "Product Code", outputHeading: "MATERIAL" }),
          expect.objectContaining({ position: 1, sourceHeading: "Description", outputHeading: "DESCRIPTION" })
        ] }
      })
    }));
  });

  it("replaces stored columns in the supplied order when reordering or removing mappings", async () => {
    const update = vi.fn().mockResolvedValue({ id: "profile-1", name: "NHS Contract", updatedAt: new Date() });
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue({ headers: ["Product Code", "Description"] }) },
      outputProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: "profile-1" }),
        update
      }
    } as unknown as PrismaClient;

    await saveOutputProfileForTenant(db, actor, profileInput({
      id: "profile-1",
      columns: [{ sourceColumnIndex: 1, sourceHeading: "Description", outputHeading: "DESCRIPTION" }]
    }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "profile-1" },
      data: expect.objectContaining({
        columns: { deleteMany: {}, create: [expect.objectContaining({ position: 0, sourceColumnIndex: 1 })] }
      })
    }));
  });

  it("reloads only headings, three-row preview metadata and compact profile configuration", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "profile-1",
      name: "NHS Contract",
      sourceWorkbookImportId: "source-1",
      sourceWorksheetId: "worksheet-1",
      sourceWorkbookImport: { originalFileName: "pricebook.xlsx" },
      sourceWorksheet: {
        id: "worksheet-1",
        name: "Products",
        headers: ["Product Code", "Description"],
        sampleRows: [["A", "Alpha"], ["B", "Beta"], ["C", "Gamma"]]
      },
      columns: [{ id: "column-1", sourceColumnIndex: 0, sourceHeading: "Product Code", outputHeading: "MATERIAL" }]
    });
    const db = { outputProfile: { findFirst } } as unknown as PrismaClient;

    const result = await loadOutputProfileBuilder(db, "tenant-1", { profileId: "profile-1" });

    expect(result?.source.sampleRows).toHaveLength(3);
    expect(result?.draft.columns[0]).toMatchObject({ sourceHeading: "Product Code", outputHeading: "MATERIAL" });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: "profile-1", tenantId: "tenant-1" });
    expect(findFirst.mock.calls[0]?.[0].select.sourceWorksheet.select).toEqual({ id: true, name: true, headers: true, sampleRows: true });
  });

  it("rejects cross-tenant or manufactured source references before any profile write", async () => {
    const create = vi.fn();
    const db = {
      sourceWorksheet: { findFirst: vi.fn().mockResolvedValue(null) },
      outputProfile: { create }
    } as unknown as PrismaClient;

    await expect(saveOutputProfileForTenant(db, actor, profileInput())).rejects.toBeInstanceOf(OutputProfileNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });

  it("scopes source lookups to the authenticated tenant and workbook", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { sourceWorksheet: { findFirst }, outputProfile: { create: vi.fn() } } as unknown as PrismaClient;

    await expect(saveOutputProfileForTenant(db, actor, profileInput())).rejects.toBeInstanceOf(OutputProfileNotFoundError);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "worksheet-1",
      sourceWorkbookImportId: "source-1",
      sourceWorkbookImport: { tenantId: "tenant-1" }
    } }));
  });

  it("rejects altered source headings and invalid output headings server-side", () => {
    expect(() => validateOutputProfileInput(profileInput({
      columns: [{ sourceColumnIndex: 0, sourceHeading: "Another tenant's field", outputHeading: "MATERIAL" }]
    }), ["Product Code", "Description"])).toThrow(OutputProfileValidationError);
    expect(() => validateOutputProfileInput(profileInput({
      columns: [{ sourceColumnIndex: 0, sourceHeading: "Product Code", outputHeading: "   " }]
    }), ["Product Code", "Description"])).toThrow("Output heading is required.");
  });
});
