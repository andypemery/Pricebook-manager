import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { outputProfileGenerationReadiness } from "../lib/data-mapper/output-profiles/configuration";
import type { OutputProfileDraft } from "../lib/data-mapper/output-profiles/types";

function draft(overrides: Partial<OutputProfileDraft> = {}): OutputProfileDraft {
  return {
    id: null, name: "Profile", filenameTemplate: "{profile}_{date}", outputFormat: "CSV", csvDelimiter: "COMMA", csvIncludeHeader: true, xlsxWorksheetName: "", worksheetMode: "SEPARATE_FILES", worksheetNameMode: "SOURCE", worksheetNameMappings: {}, selectedWorksheetIds: ["one", "two"], sourceWorkbookImportId: "source", sourceWorksheetId: "one", filterMatchMode: "ALL", filters: [],
    columns: [{ clientId: "one", columnType: "SOURCE", sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null }],
    ...overrides
  };
}

describe("final acceptance tidy regressions", () => {
  it("uses one matrix submission, excludes Axiom-only controls and keeps the update atomic", () => {
    const matrix = readFileSync(new URL("../components/role-template-grid.tsx", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../lib/actions/admin.actions.ts", import.meta.url), "utf8");
    expect(matrix).toContain("permission:${role.role}:${permission}");
    expect(matrix).toContain('key !== "manageAxiomControls"');
    expect(matrix).toContain("Save role templates");
    expect(actions).toContain("matrixPermissionsFromForm");
    expect(actions).toContain("prisma.$transaction");
    expect(actions).toContain('hasPermission(actor, "manageCustomerUsers")');
    expect(actions).toContain("tenantId_role: { tenantId: actor.tenantId, role }");
  });

  it("keeps future standard and imported users on their tenant role-template permission snapshots", () => {
    const actions = readFileSync(new URL("../lib/actions/admin.actions.ts", import.meta.url), "utf8");
    const permissions = readFileSync(new URL("../lib/permissions.ts", import.meta.url), "utf8");
    expect(actions).toMatch(/createUserAction[\s\S]*getRoleTemplatePermissions\(actor\.tenantId, role\)[\s\S]*permissions,/);
    expect(actions).toMatch(/previewUserImportAction[\s\S]*getRoleTemplatePermissions\(actor\.tenantId, role\)[\s\S]*permissions\.manageAxiomControls = false/);
    expect(actions).toMatch(/confirmUserImportAction[\s\S]*permissions: normaliseImportPermissions\(row\.permissions\) \|\| await getRoleTemplatePermissions\(actor\.tenantId, row\.role\)/);
    expect(permissions).toContain("permission in overrides");
  });

  it("blocks a blank profile name consistently without requiring a saved profile", () => {
    const worksheets = [{ id: "one", name: "One", headers: ["SKU"] }, { id: "two", name: "Two", headers: ["SKU"] }];
    const blank = outputProfileGenerationReadiness(draft({ name: "" }), "source.xlsx", "2026-09-17", worksheets);
    const valid = outputProfileGenerationReadiness(draft(), "source.xlsx", "2026-09-17", worksheets);
    expect(blank.ready).toBe(false);
    expect(blank.issues).toContain("Enter an Output Profile name before generating. You do not need to save the profile first.");
    expect(valid.ready).toBe(true);
  });

  it("keeps Output Settings ordered around the filename preview and exposes safe validation errors", () => {
    const settings = readFileSync(new URL("../components/data-mapper/output-profile-settings.tsx", import.meta.url), "utf8");
    const worksheets = readFileSync(new URL("../components/data-mapper/output-profile-worksheets.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/data-mapper/output-generation-panel.tsx", import.meta.url), "utf8");
    const route = readFileSync(new URL("../app/api/data-mapper/outputs/route.ts", import.meta.url), "utf8");
    expect(settings.indexOf("filenamePreview")).toBeLessThan(settings.indexOf("outputSettingsTwoColumn"));
    expect(settings).toContain('aria-label="CSV settings"');
    expect(settings).toContain('aria-label="XLSX settings"');
    expect(worksheets).toContain("const title = worksheet.compatibility.compatible");
    expect(panel).toContain("outputProfileGenerationReadiness");
    expect(panel).toContain("!readiness.ready");
    expect(route).toContain("error instanceof OutputProfileValidationError");
    expect(route).toContain("status: 422");
  });
});
