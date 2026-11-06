// Partner (OEM) platforms as sizer models. The spec sheet (oem-spec-sheet.ts)
// states maxima only, so each row becomes a bounded envelope the partner builds
// within, not an orderable bill of materials:
//   - Sockets: the sheet's "Single", "Dual", "Single or Dual", "Quad" ("None"
//     = compute-less option, ignored).
//   - Cores per CPU: the core counts the CPU family ships in, capped at the
//     sheet's "Processor Power" (max cores per socket). The cap itself is always
//     offered.
//   - RAM: standard per-node totals up to the sheet's max memory, scaled by
//     socket count (a 1-socket build of a dual-socket model gets half).
//   - Drives: all-flash only (user ruling). The bay count is inferred from max
//     storage / largest drive (e.g. 307.2 TB = 20 x 15.36 TB); Cisco ships
//     3.8/7.6/15.3 TB drives. Raw storage never exceeds the sheet's maximum.
//     Hybrid-only rows (SSD+HDD, NVMe+HDD) have no all-flash build and are
//     excluded, as are GPU/AI platforms (same ruling as NX-8150G / NX-9183).
//   - Use cases: the sheet's listed use cases mapped onto the sizer's five.
//   - ROBO: rows listing Remote Office/Branch Office or Edge Compute may size
//     1- and 2-node clusters (Sizer Guide: only ROBO models can; RF2 only).

import type { DriveLayout, NxCpu, NxModel, NxUseCase } from "@/lib/nx-catalog";
import { OEM_SHEET, OEM_VENDOR_LABEL, type OemSheetRow, type OemVendor } from "@/lib/oem-spec-sheet";

export { OEM_VENDORS, OEM_VENDOR_LABEL, type OemVendor } from "@/lib/oem-spec-sheet";

const SHEET_SOURCE = "Nutanix hardware platform spec sheet (partner platforms), Oct 2026";

// Core counts each CPU family ships in (per socket).
const CORE_LADDERS: { test: RegExp; family: string; cores: number[] }[] = [
  { test: /Granite Rapids-D/i, family: "Intel Xeon 6 SoC (Granite Rapids-D)", cores: [8, 12, 16, 20] },
  { test: /Xeon 6|Granite Rapids/i, family: "Intel Xeon 6 (Granite Rapids)", cores: [8, 12, 16, 20, 24, 32, 36, 48, 64, 72, 86] },
  { test: /Xeon (5th|4th)/i, family: "Intel Xeon 4th/5th Gen", cores: [8, 12, 16, 20, 24, 28, 32, 36, 48, 52, 56, 60, 64] },
  { test: /Ice Lake/i, family: "Intel Xeon 3rd Gen (Ice Lake)", cores: [8, 12, 16, 20, 24, 28, 32, 36, 40] },
  { test: /Siena|8004/i, family: "AMD EPYC 8004 (Siena)", cores: [8, 16, 24, 32, 48, 64] },
  { test: /9004\/9005/i, family: "AMD EPYC 9004/9005", cores: [8, 16, 24, 32, 48, 64, 72, 84, 96, 112, 128, 144, 160, 192] },
  { test: /9005|Turin/i, family: "AMD EPYC 9005 (Turin)", cores: [8, 16, 24, 32, 48, 64, 72, 96, 128, 144, 160, 192] },
  { test: /9004|Genoa|Bergamo/i, family: "AMD EPYC 9004 (Genoa/Bergamo)", cores: [16, 24, 32, 48, 64, 84, 96, 112, 128] },
];

const RAM_TOTALS_GIB = [128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192];

// GPU/AI platforms: excluded from VM sizing like the NX GPU models.
const GPU_PLATFORMS = new Set(["XC760xa-6N", "ProLiant DX380a Gen11 4DW", "ProLiant DX385 Gen11 GPU 8SFF", "HX650a V4", "XF8050 GPU M8"]);

const USE_CASE_MAP: Record<string, NxUseCase> = {
  "Server Virtualization": "general",
  "Private Cloud": "general",
  "Test and Development": "general",
  "Enterprise cloud": "general",
  "IT Apps": "general",
  "Database and Business Critical Apps": "database",
  DB: "database",
  "SAP HANA": "database",
  Epic: "database",
  "End-User Computing/Virtual Desktop Infrastructure": "vdi",
  VDI: "vdi",
  "Rack Dense VDI": "vdi",
  "Files and Objects": "storage",
  "Backup and Disaster Recovery": "storage",
  "Analytics and Big Data": "storage",
  "Remote Office/Branch Office": "robo",
  "Edge Compute": "robo",
};

export function oemSku(r: Pick<OemSheetRow, "vendor" | "name">): string {
  return `${r.vendor} ${r.name}`;
}

export function parseSockets(serverCompute: string): number[] {
  if (/\bQuad\b/i.test(serverCompute)) return [4];
  const out: number[] = [];
  if (/\bSingle\b/i.test(serverCompute)) out.push(1);
  if (/\bDual\b/i.test(serverCompute)) out.push(2);
  return out;
}

function cpuLadder(r: OemSheetRow): { family: string; cores: number[] } {
  const ladder = CORE_LADDERS.find((l) => l.test.test(r.serverCompute));
  const base = ladder?.cores ?? [r.coresPerSocket];
  const cores = Array.from(new Set([...base.filter((c) => c <= r.coresPerSocket), r.coresPerSocket])).sort((a, b) => a - b);
  return { family: ladder?.family ?? r.serverCompute, cores };
}

const tokens = (storageTypes: string) => storageTypes.split(",").map((t) => t.trim());

// The all-flash media the row offers (non-SED), or null when it is hybrid only.
function flashMedia(r: OemSheetRow): "NVMe" | "SSD" | null {
  const t = tokens(r.storageTypes);
  if (t.includes("All NVMe") || t.includes("NVMe+SSD")) return "NVMe";
  if (t.includes("All SSD")) return "SSD";
  return null;
}

/** Bays and drive sizes implied by the sheet's max storage. */
export function inferDrives(r: OemSheetRow): { bays: number; sizesTB: number[] } {
  const sizes = r.vendor === "Cisco" ? [3.8, 7.6, 15.3] : [3.84, 7.68, 15.36];
  for (let i = sizes.length - 1; i >= 0; i--) {
    const n = r.maxStorageTB / sizes[i];
    if (Math.round(n) >= 2 && Math.abs(n - Math.round(n)) < 0.01) return { bays: Math.round(n), sizesTB: sizes.slice(0, i + 1) };
  }
  // Max storage quoted for a hybrid build: any count of any size, capped by raw.
  return { bays: Math.min(24, Math.floor(r.maxStorageTB / sizes[0])), sizesTB: sizes };
}

function driveCounts(bays: number): number[] {
  const out: number[] = [];
  for (let n = 2; n <= bays; n += 2) out.push(n);
  if (bays >= 2 && bays % 2 === 1) out.push(bays);
  return out;
}

export function oemUseCases(r: OemSheetRow): NxUseCase[] {
  return Array.from(new Set(r.useCases.map((u) => USE_CASE_MAP[u]).filter((u): u is NxUseCase => Boolean(u))));
}

function toModel(r: OemSheetRow): NxModel {
  const sockets = parseSockets(r.serverCompute);
  const maxSockets = Math.max(...sockets);
  const { family, cores } = cpuLadder(r);
  const vendor = /AMD/i.test(r.serverCompute) ? "AMD" : "Intel";
  const cpus: NxCpu[] = cores.map((c) => ({ model: `${c}-core ${family}`, coresPerCpu: c, baseGHz: 0 }));
  const media = flashMedia(r);
  const { bays, sizesTB } = inferDrives(r);
  const drives: DriveLayout[] = media ? [{ kind: "uniform", media, counts: driveCounts(bays), sizesTB }] : [];
  const gpu = GPU_PLATFORMS.has(r.name);
  const excludedReason = gpu
    ? "GPU/AI platform: excluded from VM sizing."
    : !media
      ? `Hybrid only (${r.storageTypes}); the sizer offers all-flash builds only.`
      : sockets.length === 0
        ? "No socket option on the sheet."
        : null;
  const useCases = oemUseCases(r);
  return {
    sku: oemSku(r),
    vendor,
    cpuFamily: family,
    formFactor: r.formFactor,
    nodesPerBlock: 1,
    socketsPerNode: (maxSockets || 2) as NxModel["socketsPerNode"],
    socketOptions: sockets,
    cpus,
    ramTotalsGiB: RAM_TOTALS_GIB.filter((g) => g <= r.maxMemoryGB),
    ramMaxPerSocketGiB: maxSockets ? r.maxMemoryGB / maxSockets : null,
    ramNote: `Up to ${r.maxMemoryGB} GB per node (sheet maximum); the partner sets the DIMM population.`,
    drives,
    maxRawTB: r.maxStorageTB,
    bootDevice: null,
    psu: "Redundant",
    excluded: excludedReason != null,
    excludedReason,
    autoEligible: excludedReason == null,
    platform: r.vendor,
    envelope: true,
    useCases,
    roboCapable: useCases.includes("robo"),
    sources: [SHEET_SOURCE],
    notes: [
      `Sheet: ${r.serverCompute}, up to ${r.coresPerSocket} cores per socket, ${r.storageTypes}, max ${r.maxStorageTB} TB, max ${r.maxMemoryGB} GB.`,
      "Exact CPU SKU, DIMM and drive layout built by the partner within the sheet maxima.",
    ],
  };
}

export const OEM_MODELS: NxModel[] = OEM_SHEET.map(toModel);

export function oemModelsFor(vendor: OemVendor): NxModel[] {
  return OEM_MODELS.filter((m) => m.platform === vendor);
}

export function oemPlatformLabel(vendor: OemVendor): string {
  return OEM_VENDOR_LABEL[vendor];
}
