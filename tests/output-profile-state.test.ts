import { describe, expect, it } from "vitest";
import {
  addSourceColumn,
  mappedSourceColumnIndexes,
  moveOutputColumn,
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
      sourceColumnIndex: 0,
      sourceHeading: "Product Code",
      outputHeading: "MATERIAL"
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

  it("projects no more than three source sample rows through the current output order", () => {
    const columns = [
      { clientId: "price", sourceColumnIndex: 2, sourceHeading: "Price", outputHeading: "PRICE" },
      { clientId: "code", sourceColumnIndex: 0, sourceHeading: "Code", outputHeading: "MATERIAL" }
    ];
    const preview = outputPreviewRows(columns, [
      ["A", "Alpha", "10"],
      ["B", "Beta", "20"],
      ["C", "Gamma", "30"],
      ["D", "Delta", "40"]
    ]);

    expect(preview).toEqual([["10", "A"], ["20", "B"], ["30", "C"]]);
  });
});
