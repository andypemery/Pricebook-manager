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
    expect(result.summary.duplicateSkuCount).toBe(1);
    expect(result.summary.priceIssueCount).toBe(2);
    expect(result.summary.missingRequiredFieldCount).toBeGreaterThanOrEqual(5);
    expect(result.issues.some((issue) => issue.field === "Approval status" && issue.message === "Approval status is not recognised.")).toBe(true);
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
});
