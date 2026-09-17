import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createWorkbookSummary } from "../lib/data-mapper/excel-import/workbook-summary";
import { validateWorkbook } from "../lib/data-mapper/validation";

function workbookFromRows(rows: (string | number)[][]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");
  worksheet.addRows(rows);
  return workbook;
}

describe("validation engine", () => {
  it("reports missing required fields, duplicate SKUs, price issues and invalid approvals", () => {
    const workbook = workbookFromRows([
      ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"],
      ["A-001", "Router", 90, 100, "NHS Framework", "Partner A", "Approved"],
      ["A-001", "", -10, 0, "", "", "Maybe"],
      ["", "Switch", "", "", "NHS Framework", "Partner B", "Pending"]
    ]);
    const summary = createWorkbookSummary(workbook, "pricebook.xlsx");
    const result = validateWorkbook(workbook, summary);

    expect(result.summary.totalRowsChecked).toBe(3);
    expect(result.summary.duplicateSkuCount).toBe(2);
    expect(result.summary.priceIssueCount).toBe(2);
    expect(result.summary.missingRequiredFieldCount).toBeGreaterThanOrEqual(5);
    expect(result.issues.some((issue) => issue.field === "Approval status" && issue.message === "Approval status is not recognised.")).toBe(true);
  });

  it("flags the first and second rows in a two-member duplicate group", () => {
    const workbook = workbookFromRows([
      ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"],
      ["ABC123", "Router", 50, 100, "NHS", "Partner", "Approved"],
      ["ABC123", "Switch", 60, 120, "NHS", "Partner", "Approved"]
    ]);
    const result = validateWorkbook(workbook, createWorkbookSummary(workbook, "pricebook.xlsx"));
    const duplicates = result.issues.filter((issue) => issue.category === "duplicate-sku");

    expect(duplicates.map((issue) => issue.rowNumber)).toEqual([2, 3]);
    expect(duplicates.map((issue) => issue.message)).toEqual([
      "SKU ABC123 is duplicated on rows 2 and 3.",
      "SKU ABC123 is duplicated on rows 2 and 3."
    ]);
    expect(new Set(duplicates.map((issue) => issue.fingerprint)).size).toBe(2);
  });

  it("flags every row in a three-member duplicate group with bounded group information", () => {
    const workbook = workbookFromRows([
      ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"],
      ["ABC123", "One", 50, 100, "NHS", "Partner", "Approved"],
      ["ABC123", "Two", 60, 120, "NHS", "Partner", "Approved"],
      ["ABC123", "Three", 70, 140, "NHS", "Partner", "Approved"]
    ]);
    const result = validateWorkbook(workbook, createWorkbookSummary(workbook, "pricebook.xlsx"));
    const duplicates = result.issues.filter((issue) => issue.category === "duplicate-sku");

    expect(duplicates.map((issue) => issue.rowNumber)).toEqual([2, 3, 4]);
    expect(duplicates.every((issue) => issue.message === "SKU ABC123 appears 3 times on rows 2, 3 and 4.")).toBe(true);
  });

  it("bounds the message for a pathological duplicate group while flagging every row", () => {
    const workbook = workbookFromRows([
      ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"],
      ...Array.from({ length: 11 }, (_, index) => ["MANY", `Item ${index + 1}`, 50, 100, "NHS", "Partner", "Approved"])
    ]);
    const result = validateWorkbook(workbook, createWorkbookSummary(workbook, "pricebook.xlsx"));
    const duplicates = result.issues.filter((issue) => issue.category === "duplicate-sku");

    expect(duplicates).toHaveLength(11);
    expect(duplicates.every((issue) => issue.message === "SKU MANY appears 11 times. See all highlighted duplicate rows.")).toBe(true);
  });

  it("preserves workbook-wide duplicate detection across worksheets", () => {
    const workbook = new ExcelJS.Workbook();
    const headers = ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"];
    workbook.addWorksheet("Current").addRows([headers, ["ABC123", "Router", 50, 100, "NHS", "Partner", "Approved"]]);
    workbook.addWorksheet("Archive").addRows([headers, ["ABC123", "Old router", 40, 80, "NHS", "Partner", "Approved"]]);
    const result = validateWorkbook(workbook, createWorkbookSummary(workbook, "pricebook.xlsx"));
    const duplicates = result.issues.filter((issue) => issue.category === "duplicate-sku");

    expect(duplicates.map((issue) => issue.worksheetName)).toEqual(["Current", "Archive"]);
    expect(duplicates[0].message).toBe("SKU ABC123 is duplicated on Current row 2 and Archive row 2.");
  });

  it("warns when calculated margin is below the configured threshold", () => {
    const workbook = workbookFromRows([
      ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"],
      ["A-001", "Router", 95, 100, "NHS Framework", "Partner A", "Approved"]
    ]);
    const summary = createWorkbookSummary(workbook, "pricebook.xlsx");
    const result = validateWorkbook(workbook, summary, { minimumMarginPercentage: 10, allowedApprovalStatuses: ["approved"] });

    expect(result.summary.marginIssueCount).toBe(1);
    expect(result.issues[0]?.severity).toBe("Warning");
    expect(result.issues[0]?.message).toBe("Margin is below the 10% threshold.");
  });

  it("validates worksheet rows beyond the 100-row preview limit", () => {
    const workbook = workbookFromRows([
      ["SKU", "Item description", "Cost price", "Sell price", "Framework", "Partner", "Approval status"],
      ...Array.from({ length: 100 }, (_, index) => [
        `SKU-${index + 1}`,
        `Product ${index + 1}`,
        50,
        100,
        "NHS Framework",
        "Partner A",
        "Approved"
      ]),
      ["SKU-101", "Product 101", 50, 100, "NHS Framework", "Partner A", "Not a valid status"]
    ]);
    const summary = createWorkbookSummary(workbook, "pricebook.xlsx");
    const result = validateWorkbook(workbook, summary);

    expect(result.summary.totalRowsChecked).toBe(101);
    expect(result.issues).toContainEqual(expect.objectContaining({
      rowNumber: 102,
      field: "Approval status",
      message: "Approval status is not recognised."
    }));
  });
});
