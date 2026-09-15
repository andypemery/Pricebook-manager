import { describe, expect, it } from "vitest";
import {
  addSourceColumn,
  addStaticColumn,
  mappedSourceColumnIndexes,
  moveOutputColumn,
  outputColumnTargetIndex,
  outputPreviewRows,
  removeOutputColumn,
  renameOutputColumn
} from "../lib/data-mapper/output-profiles/profile-state";

describe("Output Profile builder state", () => {
  it("maps a source heading while preserving its immutable source name", () => {
    const columns = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "Product Code" }, "column-1");
    const renamed = renameOutputColumn(columns, "column-1", "MATERIAL");

    expect(renamed[0]).toEqual({
      clientId: "column-1",
      columnType: "SOURCE",
      sourceColumnIndex: 0,
      sourceHeading: "Product Code",
      outputHeading: "MATERIAL",
      staticValue: "",
      adjustmentType: "NONE",
      adjustmentValue: "",
      roundingDecimalPlaces: null
    });
  });

  it("allows source reuse and still reports the source as used", () => {
    const once = addSourceColumn([], { sourceColumnIndex: 1, sourceHeading: "List Price" }, "column-1");
    const twice = addSourceColumn(once, { sourceColumnIndex: 1, sourceHeading: "List Price" }, "column-2");

    expect(twice).toHaveLength(2);
    expect(mappedSourceColumnIndexes(twice)).toEqual(new Set([1]));
  });

  it("reorders and removes output columns without changing the source definitions", () => {
    const first = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "Product Code" }, "column-1");
    const columns = addSourceColumn(first, { sourceColumnIndex: 2, sourceHeading: "Description" }, "column-2");
    const reordered = moveOutputColumn(columns, "column-2", 0);
    const removed = removeOutputColumn(reordered, "column-1");

    expect(reordered.map((column) => column.sourceHeading)).toEqual(["Description", "Product Code"]);
    expect(removed.map((column) => column.clientId)).toEqual(["column-2"]);
  });

  it("inserts source headings at the beginning, between columns and at the end", () => {
    const initial = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "SKU" }, "sku");
    const end = addSourceColumn(initial, { sourceColumnIndex: 2, sourceHeading: "Price" }, "price", initial.length);
    const middle = addSourceColumn(end, { sourceColumnIndex: 1, sourceHeading: "Description" }, "description", 1);
    const beginning = addSourceColumn(middle, { sourceColumnIndex: 3, sourceHeading: "Supplier" }, "supplier", 0);

    expect(end.map((column) => column.clientId)).toEqual(["sku", "price"]);
    expect(middle.map((column) => column.clientId)).toEqual(["sku", "description", "price"]);
    expect(beginning.map((column) => column.clientId)).toEqual(["supplier", "sku", "description", "price"]);
  });

  it("converts a moving insertion marker into the correct existing-column target", () => {
    let columns = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "sku" }, "sku");
    columns = addSourceColumn(columns, { sourceColumnIndex: 1, sourceHeading: "description" }, "description");
    columns = addSourceColumn(columns, { sourceColumnIndex: 2, sourceHeading: "price" }, "price");
    columns = addSourceColumn(columns, { sourceColumnIndex: 3, sourceHeading: "currency" }, "currency");

    expect(outputColumnTargetIndex(columns, "price", 0)).toBe(0);
    expect(outputColumnTargetIndex(columns, "sku", 3)).toBe(2);
    expect(outputColumnTargetIndex(columns, "description", 4)).toBe(3);
    expect(outputColumnTargetIndex(columns, "currency", 4)).toBe(3);
  });

  it("makes a deleted source field available for reuse", () => {
    const columns = addSourceColumn([], { sourceColumnIndex: 0, sourceHeading: "SKU" }, "sku");
    expect(mappedSourceColumnIndexes(columns)).toEqual(new Set([0]));
    expect(mappedSourceColumnIndexes(removeOutputColumn(columns, "sku"))).toEqual(new Set());
  });

  it("projects no more than three source sample rows through the current output order", () => {
    const priceColumn = addSourceColumn([], { sourceColumnIndex: 2, sourceHeading: "Price" }, "price");
    const columns = addSourceColumn(priceColumn, { sourceColumnIndex: 0, sourceHeading: "Code" }, "code");
    const preview = outputPreviewRows(columns, [
      ["A", "Alpha", "10"],
      ["B", "Beta", "20"],
      ["C", "Gamma", "30"],
      ["D", "Delta", "40"]
    ]);

    expect(preview).toEqual([["10", "A"], ["20", "B"], ["30", "C"]]);
  });

  it("adds fixed columns without manufacturing a source heading", () => {
    const columns = addStaticColumn([], "fixed-1");

    expect(columns[0]).toMatchObject({
      columnType: "STATIC",
      sourceColumnIndex: null,
      sourceHeading: null,
      outputHeading: "New column",
      staticValue: ""
    });
  });
});
