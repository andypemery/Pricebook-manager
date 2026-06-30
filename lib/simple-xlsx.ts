import { inflateRawSync } from "node:zlib";

export type XlsxCellValue = string | number | boolean | null;
export type XlsxRow = Record<string, string>;

type ZipEntry = { name: string; data: Buffer };

const permissionColumns = [
  "View records",
  "Create records",
  "Edit records",
  "Archive records",
  "Upload files",
  "Export data",
  "Manage users",
  "Manage settings",
  "Manage data rights",
  "View audit log",
  "Raise support tickets",
  "Submit feature requests",
  "Report security issues"
];

export const userImportColumns = ["First name", "Surname", "Email", "Role", ...permissionColumns] as const;

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function xmlEscape(value: XlsxCellValue): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const modulo = (value - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    value = Math.floor((value - modulo) / 26);
  }
  return name;
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.replace(/[0-9]/g, "").toUpperCase();
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function buildSheet(rows: XlsxCellValue[][]): string {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function zip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function createUserImportTemplate(): Buffer {
  const usersRows: XlsxCellValue[][] = [
    [...userImportColumns],
    ["Sarah", "Jones", "sarah.jones@example.com", "Admin", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
    ["Mark", "Smith", "mark.smith@example.com", "Super User", "Y", "Y", "Y", "N", "Y", "N", "N", "N", "N", "N", "Y", "Y", "Y"],
    ["Priya", "Patel", "priya.patel@example.com", "View Only", "Y", "N", "N", "N", "N", "N", "N", "N", "N", "N", "Y", "N", "Y"]
  ];
  const instructionRows: XlsxCellValue[][] = [
    ["Axiom user import instructions"],
    ["Use the Users tab for imported users. Delete or replace the sample rows before uploading."],
    ["Required columns: First name, Surname, Email and Role."],
    ["Role must be exactly one of: View Only, Super User, Admin."],
    ["Permission columns are optional. If you omit them, the app will use the current role template settings."],
    ["If permission columns are included, use Y or N only. Blank values use the role template default."],
    ["After upload, the app shows a preview first. Nothing is created until you confirm."],
    ["When you confirm the import, valid users are created and one invite email is sent to each valid user immediately."],
    ["Invite links are valid for 24 hours or until used."],
    ["Bad rows and duplicate email addresses are skipped and shown in a skipped-row report, which can be downloaded."],
    ["Do not rename the required headings."],
    ["Permission headings should not start with the word Can."],
    ["Example permission headings: View records, Create records, Edit records, Archive records, Export data, Manage users, View audit log."]
  ];

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Users" sheetId="1" r:id="rId1"/><sheet name="Instructions" sheetId="2" r:id="rId2"/></sheets></workbook>`) },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(buildSheet(usersRows)) },
    { name: "xl/worksheets/sheet2.xml", data: Buffer.from(buildSheet(instructionRows)) }
  ];
  return zip(entries);
}

function readZip(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("The uploaded file is not a valid .xlsx file.");
  const entriesCount = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  let pos = cdOffset;
  for (let i = 0; i < entriesCount; i += 1) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error("Invalid .xlsx central directory.");
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function stripTags(value: string): string {
  return xmlUnescape(value.replace(/<[^>]*>/g, ""));
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = [];
  const siMatches = xml.match(/<si[\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xmlUnescape(match[1]));
    values.push(texts.join(""));
  }
  return values;
}

function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowMatches = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  for (const rowXml of rowMatches) {
    const row: string[] = [];
    const cellMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
    for (const cellXml of cellMatches) {
      const ref = /r="([A-Z]+\d+)"/.exec(cellXml)?.[1] || `${columnName(row.length)}1`;
      const index = columnIndex(ref);
      const type = /t="([^"]+)"/.exec(cellXml)?.[1] || "";
      let value = "";
      if (type === "inlineStr") {
        const match = /<is>([\s\S]*?)<\/is>/.exec(cellXml);
        value = match ? stripTags(match[1]) : "";
      } else {
        const match = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
        const raw = match ? xmlUnescape(match[1]) : "";
        value = type === "s" ? sharedStrings[Number(raw)] || "" : raw;
      }
      row[index] = value.trim();
    }
    rows.push(row.map((cell) => cell || ""));
  }
  return rows;
}

export function parseUserImportWorkbook(buffer: Buffer): XlsxRow[] {
  const files = readZip(buffer);
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("The workbook must include a first sheet called Users.");
  const sharedStrings = files.get("xl/sharedStrings.xml") ? parseSharedStrings(files.get("xl/sharedStrings.xml")!.toString("utf8")) : [];
  const rows = parseSheet(sheet.toString("utf8"), sharedStrings).filter((row) => row.some(Boolean));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}
