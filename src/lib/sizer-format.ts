// Display formatting for the Simple Sizer.
//
// Everything is parsed and computed in binary units (GiB/TiB) because that is
// what the exports contain and what the capacity maths needs. Everything shown
// is converted to decimal units, the way hardware vendors label capacity:
// 1 GB = 10^9 bytes, 1 TB = 10^12 bytes. A node with 384 GiB of DIMMs therefore
// displays as 412.3 GB. Every capacity that reaches the screen, the PDF or the
// workbook goes through here.

export const TIB_TO_TB = 1024 ** 4 / 1000 ** 4; // 1.099511627776
export const GIB_TO_GB = 1024 ** 3 / 1000 ** 3; // 1.073741824

/** Convert a binary TiB figure to the decimal TB that vendors quote. */
export function tibToTB(tib: number): number {
  return tib * TIB_TO_TB;
}

/** Convert a binary GiB figure to decimal GB. */
export function gibToGB(gib: number): number {
  return gib * GIB_TO_GB;
}

function num(value: number, dp: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: dp });
}

/** Whole numbers for anything counted: hosts, VMs, cores, nodes. */
export function fmtInt(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "-" : Math.round(value).toLocaleString();
}

/** Decimals for ratios and averages. */
export function fmtNum(value: number | null | undefined, dp = 1): string {
  return value == null || !Number.isFinite(value) ? "-" : num(value, dp);
}

/** Memory in decimal GB, rolling up to TB past 4,000 GB. */
export function fmtRam(gib: number | null | undefined): string {
  if (gib == null || !Number.isFinite(gib)) return "-";
  const gb = gibToGB(gib);
  if (Math.abs(gb) >= 4000) return `${num(gb / 1000, 2)} TB`;
  return `${num(gb, gb < 10 ? 2 : 1)} GB`;
}

/** Memory in decimal GB with no unit suffix, for table cells that carry their own header. */
export function fmtRamValue(gib: number | null | undefined): string {
  if (gib == null || !Number.isFinite(gib)) return "-";
  const gb = gibToGB(gib);
  return num(gb, gb < 10 ? 2 : 1);
}

/** Storage, genuinely converted from binary TiB to the decimal TB vendors quote. */
export function fmtStorage(tib: number | null | undefined, dp = 1): string {
  if (tib == null || !Number.isFinite(tib)) return "-";
  const tb = tibToTB(tib);
  if (Math.abs(tb) < 1) return `${num(tb * 1000, 0)} GB`;
  return `${num(tb, dp)} TB`;
}

/** Storage in TB with no unit suffix, for tables and spreadsheet cells. */
export function storageTB(tib: number | null | undefined, dp = 2): number | null {
  if (tib == null || !Number.isFinite(tib)) return null;
  return Number(tibToTB(tib).toFixed(dp));
}

export const UNIT_FOOTNOTE =
  "Capacities are shown in decimal units, as hardware vendors label them: 1 GB = 1,000,000,000 bytes, 1 TB = 1,000 GB. " +
  "Exports report binary units (MiB); every value is converted exactly.";
