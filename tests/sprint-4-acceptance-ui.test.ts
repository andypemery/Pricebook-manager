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
      ["Account", "/account"],
      ["Settings", "/settings"]
    ]);
    expect(navigationItems.map((item) => item.label)).not.toContain("Projects");
    expect(navigationItems.map((item) => item.label)).not.toContain("Demo Records");
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
    expect(csvMarkup).toContain("NHS_October_2026.csv");
    expect(csvMarkup).toContain("{month}");
    expect(csvMarkup).toContain('<option value="CSV" selected="">CSV</option>');
    expect(csvMarkup).toContain('<option value="XLSX">XLSX</option>');
    expect(csvMarkup).not.toContain('value="XLS"');
    expect(xlsxMarkup).toContain("Worksheet name (optional)");
    expect(xlsxMarkup).toContain("The tab name inside the Excel workbook");
    expect(xlsxMarkup).not.toContain("Effective preview date");
  });
});
