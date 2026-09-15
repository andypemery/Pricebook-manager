import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
}));

import { OutputProfileBuilder } from "../components/data-mapper/output-profile-builder";
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
  it("renders shared insertion positions and compact functional heading controls", () => {
    const markup = renderToStaticMarkup(createElement(OutputProfileBuilder, {
      source,
      initialDraft: draft,
      profiles: [{ id: "profile-1", name: "NHS Contract", sourceWorkbookImportId: "source-1", sourceWorksheetId: "worksheet-1", outputFormat: "CSV" }],
      initialEffectiveDate: "2026-09-16",
      canEdit: true
    }));

    expect(markup.match(/outputInsertionSlot/g)).toHaveLength(3);
    expect(markup.match(/aria-label="Move left"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Move right"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Delete column"/g)).toHaveLength(2);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Move left"/);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Move right"/);
    expect(markup).not.toContain("Remove column");
    expect(markup).not.toContain("outputColumnActions");
    expect(markup).not.toContain("…");
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
    expect(markup).toContain("Original source heading");
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
});
