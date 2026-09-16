import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
}));

import { OutputProfileBuilder, outputHeadingInsertionClassName } from "../components/data-mapper/output-profile-builder";
import type { OutputProfileDraft, SourceWorksheetPreview } from "../lib/data-mapper/output-profiles/types";

const source: SourceWorksheetPreview = {
  id: "worksheet-1",
  sourceWorkbookImportId: "source-1",
  workbookFileName: "Supplier.xlsx",
  worksheetName: "Products",
  headers: ["SKU", "Description", "Price"],
  sampleRows: [["A", "Alpha", "10"], ["B", "Beta", "20"], ["C", "Gamma", "30"]]
};

const draft: OutputProfileDraft = {
  id: "profile-1",
  name: "NHS Contract",
  filenameTemplate: "NHS_{month}_{year}",
  outputFormat: "CSV",
  csvDelimiter: "COMMA",
  csvIncludeHeader: true,
  xlsxWorksheetName: "",
  sourceWorkbookImportId: "source-1",
  sourceWorksheetId: "worksheet-1",
  filterMatchMode: "ALL",
  filters: [],
  columns: [
    { clientId: "sku", columnType: "SOURCE", sourceColumnIndex: 0, sourceHeading: "SKU", outputHeading: "SKU", staticValue: "", adjustmentType: "NONE", adjustmentValue: "", roundingDecimalPlaces: null },
    { clientId: "price", columnType: "SOURCE", sourceColumnIndex: 2, sourceHeading: "Price", outputHeading: "PRICE", staticValue: "", adjustmentType: "MULTIPLY", adjustmentValue: "0.82", roundingDecimalPlaces: 2 }
  ]
};

describe("Sprint 4 output-heading controls", () => {
  it("renders transient insertion feedback without persistent spacer columns", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: draft,
      profiles: [{
        id: "profile-1",
        name: "NHS Contract",
        sourceWorkbookImportId: "source-1",
        sourceWorksheetId: "worksheet-1",
        outputFormat: "CSV",
        outputColumnCount: 2,
        originWorkbookFileName: "Supplier.xlsx",
        originWorksheetName: "Products"
      }],
      initialEffectiveDate: "2026-09-16",
      canEdit: true
    }));

    expect(markup.match(/class="outputHeadingCell/g)).toHaveLength(2);
    expect(markup).not.toContain("outputInsertionSlot");
    expect(markup).not.toContain("outputInsertionBodyCell");
    expect(markup.match(/aria-label="Move left"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Move right"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Delete column"/g)).toHaveLength(2);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Move left"/);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Move right"/);
    expect(markup).not.toContain("Remove column");
    expect(markup).not.toContain("outputColumnActions");
    expect(markup).not.toContain("× …");
    expect(markup).toContain("Current Output Profile context");
    expect(markup).toContain("Supplier.xlsx");
    expect(markup).toContain("Products");
    expect(markup).toContain("Apply saved profile to this worksheet");
    expect(markup).toContain("Originally created from Supplier.xlsx · Products");
  });

  it("shows compact manual matching when an applied profile field is unresolved", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: {
        ...draft,
        id: null,
        columns: [{ ...draft.columns[1], sourceColumnIndex: null, sourceHeading: "Sell price" }]
      },
      profiles: [],
      initialApplication: {
        profileId: "profile-1",
        profileName: "NHS Contract",
        originWorkbookFileName: "August.xlsx",
        originWorksheetName: "Products",
        requiredFieldCount: 1,
        matchedFieldCount: 0,
        fields: [{
          key: "sell price",
          expectedHeading: "Sell price",
          status: "MISSING",
          sourceColumnIndex: null,
          candidateSourceColumnIndexes: [],
          outputColumnClientIds: ["price"],
          filterClientIds: []
        }]
      },
      initialEffectiveDate: "2026-09-16",
      canEdit: true
    }));

    expect(markup).toContain("0 of 1 source fields matched automatically");
    expect(markup).toContain("Expected by profile: Sell price");
    expect(markup).toContain("Choose current source column");
    expect(markup).toContain("Save as new profile");
    expect(markup).toContain("The saved profile remains unchanged");
  });

  it("removes insertion classes after drop or drag cancellation", () => {
    expect(outputHeadingInsertionClassName(false, false, 0, 0, 3)).toContain("insertionBefore");
    expect(outputHeadingInsertionClassName(false, false, 3, 2, 3)).toContain("insertionAfter");
    expect(outputHeadingInsertionClassName(false, false, null, 0, 3)).toBe("outputHeadingCell");
    expect(outputHeadingInsertionClassName(false, false, null, 2, 3)).toBe("outputHeadingCell");
  });

  it("keeps the selected-column editor compact and free of structural move/delete actions", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: draft,
      profiles: [],
      initialEffectiveDate: "2026-09-16",
      canEdit: true
    }));

    expect(markup).toContain("Output heading");
    expect(markup).toContain("Source heading");
    expect(markup).not.toContain("Original source heading");
    expect(markup).toContain("Value adjustment");
    expect(markup).toContain("Value");
    expect(markup).toContain("Rounding");
  });

  it("disables both move controls for a single output column", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: { ...draft, columns: [draft.columns[0]] },
      profiles: [],
      initialEffectiveDate: "2026-09-16",
      canEdit: true
    }));

    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Move left"/);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Move right"/);
  });

  it.each([1, 2, 3, 6])("renders exactly %i contiguous real output columns", (columnCount) => {
    const columns = Array.from({ length: columnCount }, (_, index) => ({
      ...draft.columns[index % draft.columns.length],
      clientId: `column-${index}`,
      outputHeading: `COLUMN ${index + 1}`
    }));
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: { ...draft, columns },
      profiles: [],
      initialEffectiveDate: "2026-09-16",
      canEdit: true
    }));

    expect(markup.match(/class="outputHeadingCell/g)).toHaveLength(columnCount);
    expect(markup).toContain(`${columnCount} columns`);
    expect(markup).not.toContain("outputInsertionSlot");
    expect(markup).not.toContain("outputInsertionBodyCell");
  });

  it("uses content-width output columns with horizontal scrolling instead of stretching small sheets", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.outputBuilderSheet\s*\{[^}]*width:\s*max-content;[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.outputSheetScroll\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(css).toMatch(/\.outputHeadingCell\.insertionBefore::before/);
  });
});
