import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  friendlyWorkbookName,
  getProjectDashboardMetrics,
  getProjectDetail,
  isProjectSourceAvailable,
  listProjects,
  validateProjectName
} from "../lib/data-mapper/projects/repository";
import { navigationItems } from "../config/navigation.config";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function prismaModel(schema: string, name: string) {
  const start = schema.indexOf(`model ${name} {`);
  const end = schema.indexOf("\n}", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return schema.slice(start, end + 2);
}

describe("Project Foundation schema and migration", () => {
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20260917190000_projects_foundation/migration.sql");

  it("keeps reusable Output Profiles independent and links them through a tenant-scoped join", () => {
    const project = prismaModel(schema, "Project");
    const association = prismaModel(schema, "ProjectOutputProfile");
    const outputProfile = prismaModel(schema, "OutputProfile");

    expect(project).toContain("tenantId");
    expect(project).toContain("createdById");
    expect(project).toContain("updatedById");
    expect(project).toContain("sourceWorkbookImports SourceWorkbookImport[]");
    expect(association).toContain("@@unique([projectId, outputProfileId])");
    expect(association).toContain("project         Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)");
    expect(association).toContain("outputProfile   OutputProfile @relation(fields: [outputProfileId], references: [id], onDelete: Cascade)");
    expect(outputProfile).not.toMatch(/^\s*projectId\s/m);
    expect(outputProfile).toContain("projects ProjectOutputProfile[]");
  });

  it("makes source ownership required only after deterministic tenant-preserving backfill", () => {
    const addNullable = migration.indexOf('ALTER TABLE "SourceWorkbookImport" ADD COLUMN "projectId" TEXT;');
    const projectBackfill = migration.indexOf('INSERT INTO "Project"');
    const sourceBackfill = migration.indexOf('UPDATE "SourceWorkbookImport"');
    const makeRequired = migration.indexOf('ALTER TABLE "SourceWorkbookImport" ALTER COLUMN "projectId" SET NOT NULL;');

    expect(addNullable).toBeGreaterThanOrEqual(0);
    expect(projectBackfill).toBeGreaterThan(addNullable);
    expect(sourceBackfill).toBeGreaterThan(projectBackfill);
    expect(makeRequired).toBeGreaterThan(sourceBackfill);
    expect(migration).toContain("'project_' || \"id\"");
    expect(migration).toContain('"tenantId"');
    expect(migration).toContain("regexp_replace(\"originalFileName\", '\\.(xlsx|xlsm)$', '', 'i')");
    expect(migration).not.toContain("UNIQUE (\"tenantId\", \"name\")");
  });

  it("backfills associations without copying or mutating reusable profile configuration", () => {
    expect(migration).toContain('INSERT INTO "ProjectOutputProfile"');
    expect(migration).toContain("'project_' || op.\"sourceWorkbookImportId\"");
    expect(migration).not.toMatch(/INSERT INTO\s+"OutputProfile"/i);
    expect(migration).not.toMatch(/UPDATE\s+"OutputProfile"/i);
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });
});

describe("Project domain and tenant scoping", () => {
  it("validates user-controlled names and derives friendly workbook labels", () => {
    expect(validateProjectName("  September HP Pricebook  ")).toBe("September HP Pricebook");
    expect(() => validateProjectName("   ")).toThrow("required");
    expect(() => validateProjectName("x".repeat(121))).toThrow("120 characters");
    expect(friendlyWorkbookName("HP_Pricebook_v2_FINAL.xlsx")).toBe("HP_Pricebook_v2_FINAL");
    expect(friendlyWorkbookName("Catalogue.xlsm")).toBe("Catalogue");
  });

  it("validates Project, tenant, source and worksheet in one server-side query", async () => {
    const findFirst = vi.fn(async () => ({ id: "project-1" }));
    const db = { project: { findFirst } } as unknown as PrismaClient;

    await expect(isProjectSourceAvailable(db, "tenant-1", "project-1", "source-1", "worksheet-1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-1",
        tenantId: "tenant-1",
        sourceWorkbookImports: { some: { id: "source-1", tenantId: "tenant-1", worksheets: { some: { id: "worksheet-1" } } } }
      },
      select: { id: true }
    });
  });

  it("uses bounded tenant-scoped metadata queries for Dashboard, list and detail", async () => {
    const projectFindMany = vi.fn(async () => []);
    const projectFindFirst = vi.fn(async () => null);
    const projectCount = vi.fn(async (args: { where: { sourceWorkbookImports?: unknown } }) => args.where.sourceWorkbookImports ? 2 : 5);
    const profileCount = vi.fn(async () => 7);
    const db = {
      project: { findMany: projectFindMany, findFirst: projectFindFirst, count: projectCount },
      outputProfile: { count: profileCount }
    } as unknown as PrismaClient;

    await expect(getProjectDashboardMetrics(db, "tenant-1")).resolves.toEqual({ projectCount: 5, savedProfileCount: 7, needsReviewCount: 2 });
    await listProjects(db, "tenant-1", 4);
    await getProjectDetail(db, "tenant-1", "project-1");

    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-1" },
      take: 4,
      select: expect.objectContaining({
        sourceWorkbookImports: expect.objectContaining({ where: { tenantId: "tenant-1" }, take: 1 })
      })
    }));
    expect(projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-1", tenantId: "tenant-1" },
      select: expect.objectContaining({
        sourceWorkbookImports: expect.objectContaining({ where: { tenantId: "tenant-1" }, take: 1 })
      })
    }));
  });
});

describe("Project navigation and workspace structure", () => {
  it("uses Projects as the only primary workbook workflow and keeps the legacy route safe", () => {
    expect(navigationItems.map(({ label, href }) => [label, href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Projects", "/projects"],
      ["Output Profiles", "/mapping"],
      ["Settings", "/settings"]
    ]);
    const legacyWorkbook = source("app/(app)/workbook/page.tsx");
    expect(legacyWorkbook).toContain('`/projects/${encodeURIComponent(project)}/workbook`');
    expect(legacyWorkbook).toContain(': "/projects"');
  });

  it("keeps Dashboard and Project listings metadata-only and bounded where required", () => {
    const dashboard = source("app/(app)/dashboard/page.tsx");
    const projects = source("lib/data-mapper/projects/repository.ts");
    expect(dashboard).toContain("listProjects(prisma, actor.tenantId, 4)");
    expect(dashboard).toContain("listReusableOutputProfiles(prisma, actor.tenantId, 6)");
    expect(dashboard).not.toContain("Recent Workbooks");
    expect(dashboard).not.toContain("sampleRows");
    expect(projects).toContain('take: 1');
    expect(projects).not.toContain("fileReference");
  });

  it("covers Project list, empty/current-workbook detail and the simplified resume hub", () => {
    const projectList = source("app/(app)/projects/page.tsx");
    const projectDetail = source("app/(app)/projects/[projectId]/page.tsx");
    expect(projectList).toContain("Workbook not uploaded");
    expect(projectList).toContain("associated Output Profiles");
    expect(projectDetail).toContain("Upload a workbook to start this Project.");
    expect(projectDetail).toContain("Review workbook");
    expect(projectDetail).toContain("Replace workbook");
    expect(projectDetail).toContain("Build output");
    expect(projectDetail).not.toContain("Add existing Output Profile");
    expect(projectDetail).not.toContain("Remove from Project");
    expect(projectDetail).not.toContain("outputProfile.delete");
  });

  it("guards Project-aware mapping relationships without leaking inaccessible metadata", () => {
    const mapping = source("app/(app)/mapping/page.tsx");
    const repository = source("lib/data-mapper/output-profiles/repository.ts");
    const actions = source("lib/actions/output-profile.actions.ts");
    expect(mapping).toContain("isProjectSourceAvailable");
    expect(mapping).toContain("listTenantOutputProfilesForProject");
    expect(repository).toContain("Project associations organise current use");
    expect(repository).toContain("where: { tenantId, sourceWorkbookImport: { tenantId } }");
    expect(actions).toContain("associateOutputProfileWithProjectAction");
    expect(mapping).toContain("not available to your account");
    expect(mapping).toContain("Editing here updates the reusable master");
  });

  it("keeps one Project selector and places selected-column settings below the full-width grid", () => {
    const manager = source("components/data-mapper/output-profile-manager.tsx");
    const builder = source("components/data-mapper/output-profile-builder.tsx");
    const css = source("app/globals.css");
    expect(manager.match(/<span>Output Profile<\/span>/g)).toHaveLength(1);
    expect(manager).not.toContain("Apply saved profile to this worksheet");
    expect(manager).not.toContain("Currently editing");
    expect(manager).not.toContain(">Add profile<");
    expect(manager).toContain("Used in this Project");
    expect(manager).toContain("Other reusable profiles");
    expect(builder.indexOf("outputSpreadsheetCard")).toBeLessThan(builder.indexOf("<OutputColumnInspector"));
    expect(css).toMatch(/\.outputColumnsWorkspace\s*\{\s*display:\s*block;/);
    expect(css).toContain(".outputColumnFields.source { grid-template-columns: repeat(5, minmax(0, 1fr)); }");
  });
});
