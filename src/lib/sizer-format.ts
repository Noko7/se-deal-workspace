// Display formatting for the Simple Sizer.
//
// Everything is parsed and computed in binary units (GiB/TiB) because that's
// what the source exports contain and what RF/capacity maths needs. Only the
// *display* layer lives here, and it follows how the industry actually quotes
// each resource — which is not the same for memory and storage:
//
//   Memory  — manufactured and sold in powers of two, universally labelled "GB".
//             A 1024 GiB node is "1 TB of RAM" to every vendor, and DIMM ladders
//             are 512 / 768 / 1024 / 1536. So memory keeps its binary value and
//             simply carries a GB/TB label. Converting it to decimal would print
//             "1,100 GB" for a 1024 GB node, which no one would recognise.
//
//   Storage — drives, arrays and Nutanix Sizer all quote decimal TB. So storage
//             is genuinely converted: 1 TiB = 1.0995 TB. Skipping the conversion
//             would understate a 500 TiB estate by 50 TB.
//
// Every capacity that reaches the screen or the workbook goes through here.

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
  return value == null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString();
}

/** Decimals for ratios and averages. */
export function fmtNum(value: number | null | undefined, dp = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : num(value, dp);
}

/**
 * Memory, labelled GB/TB but keeping its binary value — see the note above.
 * Rolls up to TB past 4 TB so large estates stay readable.
 */
export function fmtRam(gib: number | null | undefined): string {
  if (gib == null || !Number.isFinite(gib)) return "—";
  if (Math.abs(gib) >= 4096) return `${num(gib / 1024, 1)} TB`;
  return `${num(gib, gib < 10 ? 1 : 0)} GB`;
}

/** Memory without the unit suffix, for table cells that carry their own header. */
export function fmtRamValue(gib: number | null | undefined): string {
  if (gib == null || !Number.isFinite(gib)) return "—";
  return num(gib, gib < 10 ? 1 : 0);
}

/** Storage, genuinely converted from binary TiB to the decimal TB vendors quote. */
export function fmtStorage(tib: number | null | undefined, dp = 1): string {
  if (tib == null || !Number.isFinite(tib)) return "—";
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
  "Storage is shown in decimal TB (1 TB = 1,000 GB), converted from the binary capacity in the export. " +
  "Memory is shown in GB/TB at its binary value, the way DIMMs and node specs are quoted.";
