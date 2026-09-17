import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
}));

import { OutputColumnInspector } from "../components/data-mapper/output-column-inspector";
import { OutputProfileBuilder } from "../components/data-mapper/output-profile-builder";
import { OutputProfileWorkspace, friendlyWorkbookName, profileResumeHref, worksheetResumeHref } from "../components/data-mapper/output-profile-workspace";
import type { OutputProfileDraft, SourceWorksheetPreview } from "../lib/data-mapper/output-profiles/types";

const source: SourceWorksheetPreview = {
  id: "sheet-1",
  sourceWorkbookImportId: "source-1",
  workbookFileName: "Long supplier workbook.xlsx",
  worksheetName: "HP Print",
  headers: ["SKU", "Description", "Price"],
  sampleRows: [["A", "Alpha", "10"], ["B", "Beta", "20"], ["C", "Gamma", "30"]],
  workbookWorksheets: Array.from({ length: 8 }, (_, index) => ({ id: `sheet-${index + 1}`, name: `Worksheet ${index + 1}`, position: index, headers: ["SKU", "Description", "Price"] }))
};

const draft: OutputProfileDraft = {
  id: "profile-1",
  name: "NHS Contract",
  filenameTemplate: "{profile}_{date}",
  outputFormat: "CSV",
  csvDelimiter: "COMMA",
  csvIncludeHeader: true,
  xlsxWorksheetName: "",
  worksheetMode: "SEPARATE_FILES",
  worksheetNameMode: "SOURCE",
  worksheetNameMappings: {},
  selectedWorksheetIds: source.workbookWorksheets?.map((worksheet) => worksheet.id),
  sourceWorkbookImportId: source.sourceWorkbookImportId,
  sourceWorksheetId: source.id,
  filterMatchMode: "ALL",
  filters: [],
  columns: [
    { clientId: "sku", columnType: "SOURCE", sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null },
    { clientId: "currency", columnType: "STATIC", sourceColumnIndex: null, sourceHeading: null, outputHeading: "Currency", staticValue: "GBP", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null }
  ]
};

describe("Output Profile guided workspace", () => {
  it("renders four linked workflow stages in order with a consolidated profile header", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: draft,
      profiles: [],
      initialEffectiveDate: "2026-09-17",
      canEdit: true
    }));

    const stageIds = ["build-output", "rules-output", "worksheets", "generate"];
    stageIds.forEach((id) => expect(markup).toContain(`href="#${id}"`));
    stageIds.slice(1).forEach((id, index) => expect(markup.indexOf(`id="${stageIds[index]}"`)).toBeLessThan(markup.indexOf(`id="${id}"`)));
    expect(markup.match(/Output Profile name/g)).toHaveLength(1);
    expect(markup).toContain("Source workbook");
    expect(markup).toContain("Reference worksheet");
    expect(markup).toContain("Source Columns");
    expect(markup).toContain("Output Columns");
    expect(markup).toMatch(/class="outputColumnsWorkspace"[\s\S]*class="card spreadsheetCard outputSpreadsheetCard"[\s\S]*<aside class="outputColumnInspector"/);
    expect(markup).toContain("Add column");
    expect(markup).toContain('class="rulesOutputGrid"');
    expect(markup).toContain("Which rows should be included?");
    expect(markup).toContain("Output file");
    expect(markup).toContain("8 of 8 worksheets selected");
    expect(markup).toContain("Ready to generate");
  });

  it("shows source-backed, fixed-value and empty inspector states without a second transformation path", () => {
    const sourceMarkup = renderToStaticMarkup(createElement(OutputColumnInspector, { column: draft.columns[0], canEdit: true, onChange: vi.fn() }));
    const fixedMarkup = renderToStaticMarkup(createElement(OutputColumnInspector, { column: draft.columns[1], canEdit: true, onChange: vi.fn() }));
    const emptyMarkup = renderToStaticMarkup(createElement(OutputColumnInspector, { column: null, canEdit: true, onChange: vi.fn() }));

    expect(sourceMarkup).toContain("Source heading");
    expect(sourceMarkup).toContain("Value adjustment");
    expect(sourceMarkup).toContain("Rounding");
    expect(fixedMarkup).toContain("Fixed value");
    expect(fixedMarkup).not.toContain("Value adjustment");
    expect(emptyMarkup).toContain("Select an output column to configure it.");
  });
});

describe("business-focused Dashboard", () => {
  it("shows high-level metrics, bounded profile cards and one item per workbook without worksheet tabs", () => {
    const profiles = Array.from({ length: 8 }, (_, index) => ({
      id: `profile-${index + 1}`,
      name: `Profile ${index + 1}`,
      outputFormat: index % 2 === 0 ? "CSV" : "XLSX",
      sourceWorkbookImportId: index < 4 ? "source-1" : "source-2",
      sourceWorksheetId: `private-sheet-${index + 1}`,
      updatedAt: new Date(`2026-09-${17 - index}T09:00:00Z`),
      _count: { columns: index + 2 },
      sourceWorkbookImport: { originalFileName: index < 4 ? "Supplier price book.xlsx" : "Additional catalogue.xlsm" },
      sourceWorksheet: { name: `Private worksheet ${index + 1}` }
    }));
    const sourceImports = [
      { id: "source-1", originalFileName: "Supplier price book.xlsx", validationStatus: "VALIDATED", validatedAt: new Date("2026-09-17T08:00:00Z"), worksheets: [{ id: "sheet-1", name: "Secret HP", columnCount: 12 }, { id: "sheet-2", name: "Secret Canon", columnCount: 10 }] },
      { id: "source-2", originalFileName: "Additional catalogue.xlsm", validationStatus: "VALIDATED_WITH_ERRORS", validatedAt: new Date("2026-09-16T08:00:00Z"), worksheets: [{ id: "sheet-3", name: "Secret Epson", columnCount: 9 }] }
    ];
    const markup = renderToStaticMarkup(createElement(OutputProfileWorkspace, { workspace: { profiles, sourceImports } }));

    expect(markup).toContain("At a Glance");
    expect(markup).toContain("Saved profiles");
    expect(markup).toContain("Prepared workbooks");
    expect(markup).toContain("Needs review");
    expect(markup).toContain("Continue Working");
    expect(markup.match(/class="dashboardProfileCard"/g)).toHaveLength(6);
    expect(markup.match(/class="recentWorkbookRow"/g)).toHaveLength(2);
    expect(markup).toContain(profileResumeHref("profile-1"));
    expect(markup).toContain(worksheetResumeHref("source-1", "sheet-1").replaceAll("&", "&amp;"));
    expect(markup).not.toContain("Secret HP");
    expect(markup).not.toContain("Private worksheet");
    expect(markup).toContain('title="Supplier price book.xlsx"');
    expect(markup).toContain("Supplier price book");
    expect(friendlyWorkbookName("Supplier price book.xlsx")).toBe("Supplier price book");
  });

  it("keeps the Dashboard query parallel, tenant-scoped and metadata-only", () => {
    const repository = readFileSync(new URL("../lib/data-mapper/output-profiles/repository.ts", import.meta.url), "utf8");
    const workspaceQuery = repository.slice(repository.indexOf("export async function listOutputProfileWorkspace"), repository.indexOf("export async function listReusableOutputProfiles"));
    expect(workspaceQuery).toContain("Promise.all");
    expect(workspaceQuery.match(/where: \{ tenantId \}/g)).toHaveLength(2);
    expect(workspaceQuery).not.toContain("sampleRows");
    expect(workspaceQuery).not.toContain("sourceRows");
    expect(workspaceQuery).not.toContain("blob");
  });
});

describe("Chromium compositor regression coverage", () => {
  it("uses native scrollLeft panning and avoids large backdrop compositor layers", () => {
    const pan = readFileSync(new URL("../components/data-mapper/use-horizontal-pan.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(pan).toContain("event.currentTarget.scrollLeft = movement.scrollLeft");
    expect(pan).not.toContain("style.transform");
    expect(css).not.toContain("backdrop-filter");
    expect(css).not.toContain("will-change");
    expect(css).toMatch(/\.outputSheetScroll\s*\{[^}]*overflow-x:\s*auto/s);
  });
});
