import path from "node:path";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";

const outputFileName = "Axiom_Data_Mapper_Demo_Pricebook_20000_Rows_exceljs.xlsx";
const outputPath = path.join(process.cwd(), "public", "demo", outputFileName);

const sheets = [
  { name: "HP Print", framework: "Print Framework 2026", partner: "HP" },
  { name: "Canon Print", framework: "Print Framework 2026", partner: "Canon" },
  { name: "Epson Print", framework: "Print Framework 2026", partner: "Epson" },
  { name: "Lenovo Devices", framework: "Device Framework 2026", partner: "Lenovo" },
  { name: "Dell Devices", framework: "Device Framework 2026", partner: "Dell" },
  { name: "Accessories", framework: "Accessories Framework 2026", partner: "Axiom Supply" },
  { name: "Managed Services", framework: "Services Framework 2026", partner: "Axiom Services" },
  { name: "Software Licences", framework: "Software Framework 2026", partner: "Axiom Software" }
];

const headers = [
  "SKU",
  "Item description",
  "Cost price",
  "Sell price",
  "Margin percentage",
  "Framework",
  "Partner",
  "Approval status",
  "Category",
  "Manufacturer",
  "Currency",
  "Effective date"
];

function rowFor(sheetIndex: number, rowIndex: number, sheet: (typeof sheets)[number]) {
  const globalIndex = sheetIndex * 2500 + rowIndex;
  const costPrice = 15 + (globalIndex % 470) * 1.17;
  const sellPrice = costPrice * (1.34 + (globalIndex % 12) / 100);
  const sku = `ADM-${String(sheetIndex + 1).padStart(2, "0")}-${String(rowIndex).padStart(5, "0")}`;
  const row = [
    sku,
    `${sheet.partner} pricebook item ${rowIndex}`,
    Number(costPrice.toFixed(2)),
    Number(sellPrice.toFixed(2)),
    Number((((sellPrice - costPrice) / sellPrice) * 100).toFixed(2)),
    sheet.framework,
    sheet.partner,
    rowIndex % 9 === 0 ? "Pending" : "Approved",
    sheet.name,
    sheet.partner,
    "GBP",
    "2026-07-01"
  ];

  if (rowIndex === 10) row[0] = "";
  if (rowIndex === 20) row[0] = `ADM-${String(sheetIndex + 1).padStart(2, "0")}-00019`;
  if (rowIndex === 30) row[1] = "";
  if (rowIndex === 40) row[2] = "";
  if (rowIndex === 50) row[3] = "";
  if (rowIndex === 60) row[3] = 0;
  if (rowIndex === 70) row[2] = -12.5;
  if (rowIndex === 80) row[3] = -30;
  if (rowIndex === 90) row[4] = "Not a margin";
  if (rowIndex === 100) row[4] = 5;
  if (rowIndex === 110) row[5] = "";
  if (rowIndex === 120) row[6] = "";
  if (rowIndex === 130) row[7] = "Needs coffee";

  return row;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Axiom Data Mapper";
  workbook.created = new Date("2026-07-06T00:00:00.000Z");
  workbook.modified = workbook.created;

  for (const [sheetIndex, sheet] of sheets.entries()) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    worksheet.columns = headers.map((header) => ({ key: header, width: Math.max(16, header.length + 4) }));
    worksheet.addRow(headers);
    for (let rowIndex = 1; rowIndex <= 2500; rowIndex += 1) {
      worksheet.addRow(rowFor(sheetIndex, rowIndex, sheet));
    }
    worksheet.getRow(1).font = { bold: true };
  }

  const readme = workbook.addWorksheet("README Summary");
  readme.addRows([
    ["Axiom Data Mapper demo workbook"],
    ["Generated with ExcelJS so it is safe to import through the Sprint 2/Sprint 3 importer."],
    ["Contains 20,000 pricebook rows across 8 data worksheets."],
    ["Includes intentional validation issues: missing SKU, duplicate SKU, missing required fields, invalid prices, low margins and invalid approval status."]
  ]);
  readme.getColumn(1).width = 120;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Generated ${outputPath}`);
}

void main();
