import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Project validation and reusable-profile acceptance UI", () => {
  it("uses one authoritative workbook-wide Worksheet filter and row-level selection", () => {
    const importer = source("components/data-mapper/workbook-importer.tsx");
    expect(importer).toContain('worksheet: "All worksheets"');
    expect(importer).toContain("<span>Worksheet</span>");
    expect(importer).not.toContain("<WorksheetTabs");
    expect(importer).toContain("Select all ${visibleEligibleRowKeys.length} visible validation rows");
    expect(importer).toContain("Delete selected rows");
    expect(importer).toContain("Ignore selected errors");
    expect(importer).toContain("Restore selected errors");
    expect(importer).toContain("View / restore deleted rows");
    expect(importer).toContain("Restore all deleted rows");
    expect(importer).toContain("The original uploaded Excel file will not be changed.");
  });

  it("groups all tenant profiles by Project use and removes the redundant Add profile control", () => {
    const manager = source("components/data-mapper/output-profile-manager.tsx");
    const mapping = source("app/(app)/mapping/page.tsx");
    expect(manager).toContain('<optgroup label="Used in this Project">');
    expect(manager).toContain('<optgroup label="Other reusable profiles">');
    expect(manager).toContain("associateOutputProfileWithProjectAction");
    expect(manager).not.toContain(">Add profile<");
    expect(mapping).toContain("listTenantOutputProfilesForProject");
    expect(mapping).not.toContain("projectOutputProfile.findFirst");
  });

  it("keeps the library master editor compact and removes its invalid context-free New route", () => {
    const manager = source("components/data-mapper/output-profile-manager.tsx");
    expect(manager).toContain("masterProfileManager");
    expect(manager).toContain("Save as new profile");
    expect(manager).toContain("Back to Output Profiles");
    expect(manager).toContain("Its Project associations will be removed, but Projects, source workbooks and other profiles will not be changed.");
    expect(manager).toContain('router.replace(projectId ? newProfileUrl : "/mapping")');
    expect(manager).not.toContain("Rename");
    expect(manager).not.toContain("Add profile");
  });

  it("keeps the exclusion migration additive and leaves earlier migrations untouched", () => {
    const migration = source("prisma/migrations/20260918150000_source_row_exclusions/migration.sql");
    expect(migration).toContain('CREATE TABLE "SourceWorkbookRowExclusion"');
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(migration).not.toMatch(/ALTER TABLE "(Project|OutputProfile|SourceWorkbookImport)" (DROP|ALTER COLUMN)/);
  });
});
