import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { navigationItems } from "../config/navigation.config";
import { sidebarClassName, sidebarCollapseStorageKey } from "../components/app-shell";
import { OutputProfileFilters } from "../components/data-mapper/output-profile-filters";
import { OutputProfileSettings } from "../components/data-mapper/output-profile-settings";
import { OutputProfileWorkspace, profileResumeHref, worksheetResumeHref } from "../components/data-mapper/output-profile-workspace";
import { ValidationNextSteps } from "../components/data-mapper/validation-next-steps";
import type { OutputProfileDraft } from "../lib/data-mapper/output-profiles/types";

function profile(overrides: Partial<OutputProfileDraft> = {}): OutputProfileDraft {
  return {
    id: "profile-1",
    name: "NHS Contract",
    filenameTemplate: "NHS_{month}_{year}",
    outputFormat: "CSV",
    csvDelimiter: "COMMA",
    csvIncludeHeader: true,
    xlsxWorksheetName: "",
    sourceWorkbookImportId: "source-1",
    sourceWorksheetId: "worksheet-1",
    columns: [],
    filterMatchMode: "ALL",
    filters: [],
    ...overrides
  };
}

describe("Sprint 4 acceptance navigation and resume workflow", () => {
  it("shows only functional main navigation destinations", () => {
    expect(navigationItems.map((item) => [item.label, item.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Workbook", "/workbook"],
      ["Output Profiles", "/mapping"],
      ["Settings", "/settings"]
    ]);
    expect(navigationItems.map((item) => item.label)).not.toContain("Projects");
    expect(navigationItems.map((item) => item.label)).not.toContain("Demo Records");
    expect(navigationItems.map((item) => item.label)).not.toContain("Account");
    for (const item of navigationItems) {
      const route = item.href === "/dashboard" ? "dashboard" : item.href.slice(1);
      expect(existsSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url))).toBe(true);
    }
  });

  it("retains the established persistent collapsed-menu state", () => {
    expect(sidebarCollapseStorageKey).toBe("axiom-sidebar-collapsed");
    expect(sidebarClassName(false, false)).toBe("sidebar");
    expect(sidebarClassName(false, true)).toBe("sidebar collapsed");
    expect(sidebarClassName(true, false)).toBe("sidebar open");
  });

  it("keeps the sidebar toggle above content without clipping it", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.sidebar\s*\{[^}]*z-index:\s*40;[^}]*overflow:\s*visible;/s);
    expect(css).toMatch(/\.sidebarToggle\s*\{[^}]*z-index:\s*90;/s);
    expect(css).toMatch(/\.sidebarNav\s*\{[^}]*overflow-y:\s*auto;/s);
  });

  it("renders tenant-scoped resume links and keeps long workbook names inside stacked cards", () => {
    const longName = "Axiom_Data_Mapper_Demo_Pricebook_20000_Rows_exceljs (2).xlsx";
    const worksheetNames = ["HP Print", "Canon Print", "Epson Print", "Lenovo Devices", "Dell Devices", "Accessories", "Managed Services", "Software Licences"];
    const markup = renderToStaticMarkup(createElement(OutputProfileWorkspace, {
      workspace: {
        profiles: [{
          id: "profile / 1",
          name: "NHS Contract",
          outputFormat: "CSV",
          sourceWorkbookImportId: "source / 1",
          sourceWorksheetId: "worksheet / 1",
          updatedAt: new Date("2026-09-16T09:00:00Z"),
          _count: { columns: 5 },
          sourceWorkbookImport: { originalFileName: longName },
          sourceWorksheet: { name: "HP Print" }
        }],
        sourceImports: [{
          id: "source / 1",
          originalFileName: longName,
          validationStatus: "VALIDATED_WITH_ERRORS",
          validatedAt: new Date("2026-09-16T08:00:00Z"),
          worksheets: worksheetNames.map((name, index) => ({ id: `worksheet / ${index + 1}`, name, columnCount: 12 }))
        }]
      }
    }));

    expect(markup).toContain(profileResumeHref("profile / 1").replaceAll("&", "&amp;"));
    expect(markup).toContain(worksheetResumeHref("source / 1", "worksheet / 1").replaceAll("&", "&amp;"));
    expect(markup).toContain(longName);
    expect(markup).toContain("Resume NHS Contract");
    worksheetNames.forEach((name) => expect(markup).toContain(name));
    expect(markup.indexOf("Saved Output Profiles")).toBeLessThan(markup.indexOf("Validated Sources"));

    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.outputProfileWorkspaceGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    expect(css).toMatch(/\.workspaceFilename[^}]*overflow-wrap:\s*anywhere/s);
    expect(css).toMatch(/\.sourceWorksheetChoices\s*\{[^}]*repeat\(auto-fit/s);
  });
});

describe("Sprint 4 direct output and Account cleanup", () => {
  it("keeps only the compact structural heading controls and removes legacy ellipsis text", () => {
    const builder = readFileSync(new URL("../components/data-mapper/output-profile-builder.tsx", import.meta.url), "utf8");
    const rules = readFileSync(new URL("../lib/data-mapper/output-profiles/rules.ts", import.meta.url), "utf8");
    expect(builder).toContain('aria-label="Move left"');
    expect(builder).toContain('aria-label="Move right"');
    expect(builder).toContain('aria-label="Delete column"');
    expect(rules).not.toContain('"…"');
  });

  it("keeps Account in Settings, moves Role Templates under Users and preserves compatibility redirects", () => {
    const settings = readFileSync(new URL("../app/(app)/settings/page.tsx", import.meta.url), "utf8");
    const account = readFileSync(new URL("../app/(app)/account/page.tsx", import.meta.url), "utf8");
    const users = readFileSync(new URL("../app/(app)/admin/users/page.tsx", import.meta.url), "utf8");
    const legacyRoleTemplates = readFileSync(new URL("../app/(app)/account/role-templates/page.tsx", import.meta.url), "utf8");
    expect(settings).toContain('id="account"');
    expect(settings).toContain("Appearance");
    expect(settings).not.toContain("Role Templates");
    expect(users).toContain('href="/admin/users/role-templates"');
    expect(legacyRoleTemplates).toContain('redirect("/admin/users/role-templates")');
    expect(account).toContain('redirect("/settings#account")');
  });
});

describe("Sprint 4 acceptance validation workflow", () => {
  it("distinguishes blocking errors from warnings and exposes both next actions", () => {
    const markup = renderToStaticMarkup(createElement(ValidationNextSteps, {
      errorCount: 2,
      warningCount: 3,
      canContinue: true,
      isPreparing: false,
      onUploadCorrected: vi.fn(),
      onContinue: vi.fn()
    }));
    expect(markup).toContain("Correct these values in the source file and upload the corrected workbook");
    expect(markup).toContain("Warnings highlight values to review");
    expect(markup).toContain("Upload corrected workbook");
    expect(markup).toContain("Continue to Output Profile");
    expect(markup).toContain("Blocking source errors must be resolved");
  });
});

describe("Sprint 4 acceptance filter and output settings UI", () => {
  it("puts the row-filter add control after zero, one and multiple rules", () => {
    for (const filters of [[], [1], [1, 2, 3]]) {
      const markup = renderToStaticMarkup(createElement(OutputProfileFilters, {
        headers: ["SKU"],
        filters: filters.map((value) => ({ clientId: `filter-${value}`, sourceColumnIndex: 0, sourceHeading: "SKU", operator: "EQUALS" as const, comparisonValue: "A" })),
        matchMode: "ALL",
        canEdit: true,
        onAdd: vi.fn(),
        onChange: vi.fn(),
        onMove: vi.fn(),
        onRemove: vi.fn(),
        onMatchModeChange: vi.fn()
      }));
      expect(markup).toContain('aria-label="Add row filter"');
      expect(markup.lastIndexOf("Add row filter")).toBeGreaterThan(markup.lastIndexOf("filterRule"));
    }
  });

  it("uses Filename date, preserves tokens, exposes only CSV/XLSX and makes worksheet name optional", () => {
    const csvMarkup = renderToStaticMarkup(createElement(OutputProfileSettings, {
      profile: profile(),
      sourceFilename: "Supplier.xlsx",
      filenameDate: "2026-10-01",
      canEdit: true,
      onChange: vi.fn(),
      onFilenameDateChange: vi.fn()
    }));
    const xlsxMarkup = renderToStaticMarkup(createElement(OutputProfileSettings, {
      profile: profile({ outputFormat: "XLSX" }),
      sourceFilename: "Supplier.xlsx",
      filenameDate: "2026-10-01",
      canEdit: true,
      onChange: vi.fn(),
      onFilenameDateChange: vi.fn()
    }));

    expect(csvMarkup).toContain("Filename date");
    expect(csvMarkup).toContain('type="date"');
    expect(csvMarkup).toContain('aria-label="Choose filename date"');
    expect(csvMarkup).toContain("datePickerButton");
    expect(csvMarkup).toContain("NHS_October_2026.csv");
    expect(csvMarkup).toContain("{month}");
    expect(csvMarkup).toContain('<option value="CSV" selected="">CSV</option>');
    expect(csvMarkup).toContain('<option value="XLSX">XLSX</option>');
    expect(csvMarkup).not.toContain('value="XLS"');
    expect(xlsxMarkup).toContain("Worksheet name (optional)");
    expect(xlsxMarkup).toContain("The tab name inside the Excel workbook");
    expect(xlsxMarkup).not.toContain("Effective preview date");
  });

  it("shows reusable worksheet modes, current-workbook selection, compatibility and compact ZIP examples", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileSettings, {
      profile: profile({
        name: "NHS",
        worksheetMode: "SEPARATE_FILES",
        worksheetNameMode: "CUSTOM",
        worksheetNameMappings: { "hp print": "HP", "canon print": "Canon" },
        selectedWorksheetIds: ["sheet-1", "sheet-2"],
        columns: [{ clientId: "column-1", columnType: "SOURCE", sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null }]
      }),
      sourceFilename: "Supplier.xlsx",
      worksheets: [
        { id: "sheet-1", name: "HP Print", position: 0, headers: ["SKU"] },
        { id: "sheet-2", name: "Canon Print", position: 1, headers: ["SKU"] },
        { id: "sheet-3", name: "Software", position: 2, headers: ["Description"] }
      ],
      filenameDate: "2026-09-16",
      canEdit: true,
      onChange: vi.fn(),
      onFilenameDateChange: vi.fn()
    }));
    expect(markup).toContain("Combine all worksheets into one");
    expect(markup).toContain("Keep source worksheets separate");
    expect(markup).toContain("Create a separate file for each worksheet");
    expect(markup).toContain("Worksheets to include");
    expect(markup).toContain("This selection applies only to the current workbook");
    expect(markup).toContain("Software");
    expect(markup).toContain("Needs attention");
    expect(markup).toContain("NHS_September_2026.zip");
    expect(markup).toContain("NHS_September_2026_HP.csv");
    expect(markup).toContain("NHS_September_2026_Canon.csv");
  });
});

describe("Sprint 4 current Output Profile page cleanup", () => {
  it("keeps Validated Sources on Dashboard and removes source libraries from the current editor", () => {
    const mappingPage = readFileSync(new URL("../app/(app)/mapping/page.tsx", import.meta.url), "utf8");
    const dashboardPage = readFileSync(new URL("../app/(app)/dashboard/page.tsx", import.meta.url), "utf8");
    const workspace = readFileSync(new URL("../components/data-mapper/output-profile-workspace.tsx", import.meta.url), "utf8");

    expect(mappingPage).not.toContain("OutputProfileWorkspace");
    expect(mappingPage).not.toContain("Validated Sources");
    expect(mappingPage).toContain("Choose a workbook to build or apply an Output Profile");
    expect(dashboardPage).toContain("OutputProfileWorkspace");
    expect(workspace).toContain("Validated Sources");
    expect(workspace).toContain("worksheetResumeHref");
  });
});
