// Install Base Report — Excel workbook builder (ExcelJS, browser-side).
//
// Produces the polished, color-coded .xlsx entirely in memory and returns a Blob
// for download. Sheet order mirrors the reference workbook:
//   1) "Legend"        — the color key
//   2) "Install Base"  — the merged, color-coded data (AE email column hidden)
//   3) "Reports"       — optional embedded usage charts
// Nothing is persisted anywhere.

import ExcelJS from "exceljs";
import { COLUMNS, type FieldKey, type MergedRow } from "./parse";
import { CATEGORY_STYLE, categoryFor, type ColorCategory, parseNumber, parsePercent } from "./rules";
import { buildReportCharts, type ReportOptions } from "./charts";
import { HARDWARE_COLUMNS, hardwareCategoryFor, type HardwareFieldKey, type HardwareRow } from "./hardware";

const HEADER_FILL = "FFC6E0B4"; // light green table header
const HEADER_FONT = "FF375623"; // dark green text
const GRID = "FFD7D7D7";

const PERCENT_KEYS: FieldKey[] = [
  "cpuUsedPct",
  "memoryUsedPct",
  "storageUsedPct",
  "n1CpuPct",
  "n1MemoryPct",
  "n1StoragePct",
];
const COUNT_KEYS: FieldKey[] = ["blockCount", "nodeCount", "userVmCount", "cpuCoreCount"];

const COLUMN_WIDTH: Partial<Record<FieldKey, number>> = {
  accountName: 30,
  clusterName: 26,
  accountExecutive: 22,
  accountExecutiveEmail: 26,
  clusterUuid: 34,
  managingPcVersion: 16,
  blockCount: 11,
  nodeCount: 15,
  userVmCount: 11,
  cpuCoreCount: 13,
  memoryCapacity: 15,
  storageCapacity: 15,
  cpuUsedPct: 12,
  memoryUsedPct: 13,
  storageUsedPct: 13,
  n1CpuPct: 16,
  n1MemoryPct: 16,
  n1StoragePct: 16,
  hypervisor: 11,
  subRegion: 12,
  hypervisorVersion: 16,
  licenseType: 22,
  licenseClass: 16,
  aosVersion: 14,
  nccVersion: 13,
  lcmVersion: 13,
  foundationVersion: 22,
  lastPulse: 12,
  clusterExpiryDate: 16,
};

// The Legend sheet content: stacked example cells per column, matching the
// reference workbook's color key.
const LEGEND: Partial<Record<FieldKey, { text: string; category: ColorCategory }[]>> = {
  accountExecutiveEmail: [{ text: "Hidden", category: "none" }],
  clusterUuid: [{ text: "Unique Cluster ID", category: "none" }],
  managingPcVersion: [{ text: "Key is in PC EOL Sheet", category: "green" }],
  blockCount: [{ text: "6 or more", category: "green" }],
  nodeCount: [{ text: "6 or more", category: "green" }],
  userVmCount: [{ text: "100 or more", category: "green" }],
  cpuCoreCount: [{ text: "108 or more", category: "green" }],
  cpuUsedPct: [
    { text: "80% or more", category: "red" },
    { text: "65% or more", category: "yellow" },
  ],
  memoryUsedPct: [
    { text: "80% or more", category: "red" },
    { text: "65% or more", category: "yellow" },
  ],
  storageUsedPct: [
    { text: "80% or more", category: "red" },
    { text: "65% or more", category: "yellow" },
  ],
  n1CpuPct: [
    { text: "80% or more", category: "red" },
    { text: "65% or more", category: "yellow" },
  ],
  n1MemoryPct: [
    { text: "80% or more", category: "red" },
    { text: "65% or more", category: "yellow" },
  ],
  n1StoragePct: [
    { text: "80% or more", category: "red" },
    { text: "65% or more", category: "yellow" },
  ],
  hypervisor: [
    { text: "AHV", category: "green" },
    { text: "ESX", category: "red" },
    { text: "Hyper-V", category: "blue" },
  ],
  hypervisorVersion: [{ text: "6 x ESX", category: "red" }],
  licenseType: [
    { text: "NCI", category: "green" },
    { text: "NCM", category: "green" },
    { text: "Not Found", category: "red" },
    { text: "Pro", category: "red" },
    { text: "Prism Pro", category: "red" },
  ],
  licenseClass: [
    { text: "Appliance", category: "orange" },
    { text: "Not Found", category: "yellow" },
  ],
  aosVersion: [{ text: "Key is in AOS EOL Sheet", category: "green" }],
  nccVersion: [
    { text: "Parent Version", category: "green" },
    { text: "1 Version Behind", category: "yellow" },
  ],
};

const stripDataUrl = (dataUrl: string): string => dataUrl.replace(/^data:image\/png;base64,/, "");

function fillFor(cell: ExcelJS.Cell, category: ColorCategory) {
  if (category === "none") return;
  const style = CATEGORY_STYLE[category];
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
  cell.font = { color: { argb: style.font } };
}

function styleHeaderCell(cell: ExcelJS.Cell, label: string) {
  cell.value = label;
  cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  cell.border = {
    top: { style: "thin", color: { argb: GRID } },
    bottom: { style: "thin", color: { argb: GRID } },
    left: { style: "thin", color: { argb: GRID } },
    right: { style: "thin", color: { argb: GRID } },
  };
}

function setColumnWidths(ws: ExcelJS.Worksheet) {
  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = COLUMN_WIDTH[col.key] ?? 16;
  });
}

const HARDWARE_WIDTH: Partial<Record<HardwareFieldKey, number>> = {
  accountOwner: 20,
  accountName: 30,
  clusterName: 24,
  productName: 30,
  serialNumber: 20,
  installCity: 20,
  contractStatus: 20,
  contractEndDate: 18,
};

export type WorkbookOptions = {
  includeReports: boolean;
  reportOptions: ReportOptions;
  /** Part 3 hardware rows. Empty/absent = no Hardware sheet. */
  hardwareRows?: HardwareRow[];
};

function buildLegendSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Legend", { views: [{ state: "frozen", ySplit: 1 }] });
  const header = ws.getRow(1);
  COLUMNS.forEach((col, i) => styleHeaderCell(header.getCell(i + 1), col.label));
  header.height = 30;
  setColumnWidths(ws);

  COLUMNS.forEach((col, i) => {
    const entries = LEGEND[col.key];
    if (!entries) return;
    entries.forEach((entry, j) => {
      const cell = ws.getRow(2 + j).getCell(i + 1);
      cell.value = entry.text;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      fillFor(cell, entry.category);
      cell.border = {
        top: { style: "hair", color: { argb: GRID } },
        bottom: { style: "hair", color: { argb: GRID } },
        left: { style: "hair", color: { argb: GRID } },
        right: { style: "hair", color: { argb: GRID } },
      };
    });
  });
}

function buildDataSheet(wb: ExcelJS.Workbook, rows: MergedRow[]) {
  const ws = wb.addWorksheet("Install Base", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });
  const colCount = COLUMNS.length;

  // Header at row 1 (a filterable table header, matching the reference sheet).
  const header = ws.getRow(1);
  COLUMNS.forEach((col, i) => styleHeaderCell(header.getCell(i + 1), col.label));
  header.height = 30;
  setColumnWidths(ws);

  rows.forEach((row, r) => {
    const excelRow = ws.getRow(r + 2);
    COLUMNS.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const raw = row[col.key] ?? "";

      if (PERCENT_KEYS.includes(col.key)) {
        const p = parsePercent(raw);
        if (p !== null) {
          cell.value = p;
          cell.numFmt = '0.00"%"';
          cell.alignment = { horizontal: "right" };
        } else {
          cell.value = raw;
          cell.alignment = { horizontal: "right" };
        }
      } else if (COUNT_KEYS.includes(col.key)) {
        const n = parseNumber(raw);
        if (n !== null) {
          cell.value = n;
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "right" };
        } else {
          cell.value = raw;
        }
      } else {
        cell.value = raw;
      }

      fillFor(cell, categoryFor(col.key, row));
      cell.border = {
        top: { style: "hair", color: { argb: GRID } },
        bottom: { style: "hair", color: { argb: GRID } },
        left: { style: "hair", color: { argb: GRID } },
        right: { style: "hair", color: { argb: GRID } },
      };
    });
  });

  // Hide the Account Executive Email column (kept, not deleted).
  const emailIdx = COLUMNS.findIndex((c) => c.key === "accountExecutiveEmail");
  if (emailIdx >= 0) ws.getColumn(emailIdx + 1).hidden = true;

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colCount } };
}

function buildHardwareSheet(wb: ExcelJS.Workbook, rows: HardwareRow[], now: Date) {
  const ws = wb.addWorksheet("Hardware", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });
  const colCount = HARDWARE_COLUMNS.length;

  const header = ws.getRow(1);
  HARDWARE_COLUMNS.forEach((col, i) => styleHeaderCell(header.getCell(i + 1), col.label));
  header.height = 30;
  HARDWARE_COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = HARDWARE_WIDTH[col.key] ?? 18;
  });

  rows.forEach((row, r) => {
    const excelRow = ws.getRow(r + 2);
    HARDWARE_COLUMNS.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = row[col.key] ?? "";
      fillFor(cell, hardwareCategoryFor(col.key, row, now));
      cell.border = {
        top: { style: "hair", color: { argb: GRID } },
        bottom: { style: "hair", color: { argb: GRID } },
        left: { style: "hair", color: { argb: GRID } },
        right: { style: "hair", color: { argb: GRID } },
      };
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colCount } };
}

function buildReportsSheet(wb: ExcelJS.Workbook, rows: MergedRow[], reportOptions: ReportOptions) {
  const charts = buildReportCharts(rows, reportOptions);
  const all = [...charts.current, ...charts.n1, ...(charts.specific ? [charts.specific] : [])];
  if (all.length === 0) return;

  const rs = wb.addWorksheet("Reports");
  rs.getColumn(1).width = 4;
  rs.mergeCells("B1:K1");
  const rt = rs.getCell("B1");
  rt.value = "Install Base — Usage Charts";
  rt.font = { bold: true, size: 14, color: { argb: HEADER_FONT } };
  rt.alignment = { horizontal: "center", vertical: "middle" };
  rt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  rs.getRow(1).height = 26;

  let anchorRow = 2;
  for (const chart of all) {
    if (!chart.dataUrl) continue;
    const heading = rs.getCell(`B${anchorRow + 1}`);
    heading.value = chart.title;
    heading.font = { bold: true, size: 12, color: { argb: "FF313131" } };
    const imgId = wb.addImage({ base64: stripDataUrl(chart.dataUrl), extension: "png" });
    const displayW = 720;
    const displayH = Math.round((chart.heightPx / chart.widthPx) * displayW);
    rs.addImage(imgId, { tl: { col: 1, row: anchorRow + 1 }, ext: { width: displayW, height: displayH } });
    anchorRow += Math.ceil(displayH / 20) + 3;
  }
}

export async function buildWorkbookBlob(rows: MergedRow[], opts: WorkbookOptions): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SE Deal Workspace — Install Base Report";
  wb.created = new Date();

  buildLegendSheet(wb);
  buildDataSheet(wb, rows);
  // Report generation time drives the Contract End Date coloring.
  if (opts.hardwareRows && opts.hardwareRows.length > 0) {
    buildHardwareSheet(wb, opts.hardwareRows, new Date());
  }
  if (opts.includeReports) buildReportsSheet(wb, rows, opts.reportOptions);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
