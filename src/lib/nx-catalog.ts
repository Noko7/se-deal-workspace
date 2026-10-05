// Nutanix NX G10 hardware options the VM-based sizer picks from. Every value is
// transcribed from the vendor System Specifications PDFs in
// docs/nx-g10-hw-specs/ (dated Aug-Sep 2026); `sources` cites PDF page numbers.
// Nothing is invented: anything a sheet does not state is null and explained in
// that model's `notes`.
//
// Memory "GB" in the spec sheets is JEDEC binary, so totals are stored as GiB
// with the same number (e.g. 8 x 64 GB = 512 -> 512 GiB).
//
// Rulings from the user that override spec-sheet conflicts:
//   - NX-1175S-G10: 128 GB DIMMs allowed (max 1024 GiB/node) even though the
//     DIMM installation table omits them.
//   - Where the spec table offers a DIMM size the population table omits
//     (NX-8150-G10 96 GB; NX-8150G-G10 32 GB; NX-8170A-G10 32 GB) the spec-table
//     size is included: total RAM matters, partners build the DIMM layout.
//   - NX-8173AS-G10: 14 drives allowed (spec table says yes, p.3 list omits it).
//   - NX-9183-G10: minimum 4 drives (spec table also shows 0).
//   - NST (NVMe Storage Tier) configs are excluded (NUS-only), SED variants are
//     excluded (same capacities), compute-only (0 drive) configs are excluded.
//   - autoEligible = recorded from the original sizing order; NX Auto now picks
//     from the models listed for a use case (see NX_USE_CASES).
//     NX-1120AS-G10 is selectable but not auto. NX-8155AS-G10 (storage-only),
//     NX-9183-G10 (GPU-required) and NX-8150G-G10 (GPU platform) are excluded.
//
// CPU lists include every option (even under 12 cores per node); the engine
// filters. `coresPerCpu` is per CPU, multiply by `socketsPerNode`.

export type DriveMedia = "NVMe" | "SSD" | "HDD";

// One way to populate a node's data drives. Engine enumerates count x size.
export type DriveLayout =
  | { kind: "uniform"; media: "NVMe" | "SSD"; counts: number[]; sizesTB: number[] }
  // Hybrid: fixed counts per tier; any listed NVMe size with any listed HDD size.
  | {
      kind: "hybrid";
      nvme: { count: number; sizesTB: number[] };
      hdd: { count: number; sizesTB: number[] };
      minNvmeCapacityShare: number | null;
    };

export type NxCpu = { model: string; coresPerCpu: number; baseGHz: number };

export type NxModel = {
  sku: string; // e.g. "NX-1175S-G10"
  vendor: "Intel" | "AMD";
  cpuFamily: string; // as stated on the sheet
  formFactor: string; // e.g. "1U1N"
  nodesPerBlock: number;
  socketsPerNode: 1 | 2 | 4; // the (largest) socket count
  // Partner envelopes offer several socket counts (e.g. "Single or Dual").
  socketOptions?: number[];
  cpus: NxCpu[]; // every option; cores PER CPU
  ramTotalsGiB: number[]; // DIMM count x DIMM size over stated options, deduped, ascending
  ramNote: string; // DIMM slots, sizes, counts allowed (for the report)
  drives: DriveLayout[];
  // Partner envelopes: RAM scales with populated sockets; raw TB is capped.
  ramMaxPerSocketGiB?: number | null;
  maxRawTB?: number | null;
  bootDevice: string | null; // verbatim
  psu: string;
  excluded: boolean;
  excludedReason: string | null;
  autoEligible: boolean;
  // Build vendor; undefined = Nutanix NX. Partner rows are envelopes from the
  // hardware platform spec sheet (oem-catalog.ts), not exact BOMs.
  platform?: "Dell" | "HPE" | "Cisco" | "Lenovo" | "Fsas Tech" | "Fujitsu";
  envelope?: boolean;
  useCases?: NxUseCase[];
  // Sizer Guide: ROBO models may size 1- and 2-node clusters (RF2).
  roboCapable?: boolean;
  sources: string[];
  notes: string[];
};

// ---- helpers (keep the table below readable and the arithmetic honest) ----

const cpu = (model: string, coresPerCpu: number, baseGHz: number): NxCpu => ({
  model,
  coresPerCpu,
  baseGHz,
});

// Every per-node total = DIMM count x DIMM size, deduped and ascending.
function ramTotals(counts: number[], sizes: number[]): number[] {
  const set = new Set<number>();
  for (const c of counts) for (const s of sizes) set.add(c * s);
  return [...set].sort((a, b) => a - b);
}

// Inclusive even-step range, e.g. evens(4, 12) -> [4, 6, 8, 10, 12].
function evens(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n += 2) out.push(n);
  return out;
}

const NVME_SIZES = [3.84, 7.68, 15.36];
const SSD_SIZES = [3.84, 7.68];
const NST_NOTE =
  "NST (NVMe Storage Tier) configs are NUS-only and are excluded; SED variants (same capacities) are excluded.";

// 1U1N-class Granite Rapids / Turin lists are shared by value across sheets, but
// each model keeps its own explicit list because the options differ per sheet.
const GR = "Intel Xeon";

export const NX_MODELS: NxModel[] = [
  {
    sku: "NX-1120AS-G10",
    vendor: "AMD",
    cpuFamily: "Siena",
    formFactor: "1U1N",
    nodesPerBlock: 1,
    socketsPerNode: 1,
    cpus: [
      cpu("AMD EPYC 8024P", 8, 2.4),
      cpu("AMD EPYC 8124P", 16, 2.45),
    ],
    ramTotalsGiB: ramTotals([2, 4, 6], [32, 64]),
    ramNote:
      "6 DIMM slots. 32 GB or 64 GB DIMMs, 2, 4 or 6 per node, same capacity only (minimum 2). Memory runs at 4800 MT/s.",
    drives: [{ kind: "uniform", media: "NVMe", counts: [2], sizesTB: [1.92, 3.84, 7.68] }],
    bootDevice: "1 x 512GB M.2 Boot Device",
    psu: "1 x 800 W installed (chassis has two slots); no redundancy at 110 V or 208-240 V",
    excluded: false,
    excludedReason: null,
    autoEligible: false,
    roboCapable: true,
    sources: [
      "System-Specs-NX1120ASG10.pdf p.3 (form factor, all-NVMe only)",
      "p.6 (CPU, memory, boot)",
      "p.7 (drives, PSU)",
      "p.12 (PSU redundancy)",
      "p.13-14 (DIMM rules and installation order)",
    ],
    notes: [
      "Partner spec sheet (Oct 2026) lists 2x/4x NVMe and 96 GB DIMMs; the System Specifications PDF (2 drives, 32/64 GB DIMMs) is kept.",
      "Selectable but skipped by the automatic step-through (autoEligible=false).",
      "All-NVMe only; partial population is not supported, so exactly 2 drives. No SSD or HDD option.",
      "The 8024P is flagged 'Excluded from ENERGY STAR certification' on the sheet.",
      "DIMM sizes 32/64 GB only; the sheet does not list 96 or 128 GB.",
      "Only one PSU is installed, so the node has no power redundancy.",
      NST_NOTE,
    ],
  },
  {
    sku: "NX-1175S-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids",
    formFactor: "1U1N",
    nodesPerBlock: 1,
    socketsPerNode: 1,
    cpus: [
      cpu(`${GR} 6505P`, 12, 2.2),
      cpu(`${GR} 6507P`, 8, 3.5),
      cpu(`${GR} 6515P`, 16, 2.3),
      cpu(`${GR} 6517P`, 16, 3.2),
      cpu(`${GR} 6521P`, 24, 2.6),
      cpu(`${GR} 6527P`, 24, 3.0),
      cpu(`${GR} 6530P`, 32, 2.3),
      cpu(`${GR} 6714P`, 8, 4.0),
      cpu(`${GR} 6724P`, 16, 3.6),
      cpu(`${GR} 6731P`, 32, 2.5),
      cpu(`${GR} 6736P`, 36, 2.0),
    ],
    ramTotalsGiB: ramTotals([4, 8], [32, 64, 96, 128]),
    ramNote:
      "8 DIMM slots. 32, 64, 96 or 128 GB DIMMs, 4 or 8 per node, same capacity only (minimum 4). 128 GB allowed by user ruling; max 1024 GiB.",
    drives: [
      { kind: "uniform", media: "NVMe", counts: [2, 4], sizesTB: NVME_SIZES },
      {
        kind: "hybrid",
        nvme: { count: 2, sizesTB: NVME_SIZES },
        hdd: { count: 2, sizesTB: [8, 12, 18] },
        minNvmeCapacityShare: 0.3,
      },
    ],
    bootDevice: null,
    psu: "2 x 800 W, redundant at 110 V and 208-240 V",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    roboCapable: true,
    sources: [
      "System-Specs-NX1175SG10.pdf p.3 (drive configs, 30% hybrid rule)",
      "p.8 (CPU)",
      "p.9 (memory)",
      "p.10 (drive options)",
      "p.16 (PSU redundancy)",
      "p.18-19 (DIMM rules and installation order)",
    ],
    notes: [
      "Conflict: System Characteristics table (p.9) lists 128 GB DIMMs (max 1024 GB) but the DIMM installation table (p.19) lists only 32/64/96 GB (max 768 GB). User ruling: 128 GB allowed.",
      "Hybrid rule (p.3): 'NVMe capacity must be greater than or equal to 30% of total capacity' -> minNvmeCapacityShare 0.3. Hybrid is factory-installed only.",
      "All-NVMe supports 2 or 4 drives (add in pairs); hybrid is exactly 2 NVMe + 2 HDD. Compute-only (0 drives) excluded.",
      "HDD sizes 8/12/18 TB for non-SED hybrid; the SED hybrid (8/12 TB) is excluded.",
      "Boot device not stated in the spec table (exploded view shows an M.2 drive, no count or capacity), so bootDevice is null.",
      NST_NOTE,
    ],
  },
  {
    sku: "NX-3035-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids",
    formFactor: "2U2N",
    nodesPerBlock: 2,
    socketsPerNode: 2,
    cpus: [
      cpu(`${GR} 6505P`, 12, 2.2),
      cpu(`${GR} 6507P`, 8, 3.5),
      cpu(`${GR} 6515P`, 16, 2.3),
      cpu(`${GR} 6517P`, 16, 3.2),
      cpu(`${GR} 6520P`, 24, 2.4),
      cpu(`${GR} 6527P`, 24, 3.0),
    ],
    ramTotalsGiB: ramTotals([8, 16], [64, 96, 128]),
    ramNote:
      "16 DIMM slots per node (8 per CPU). 64, 96 or 128 GB DIMMs, 8 or 16 per node, same capacity only; no 32 GB option. 1DPC at 6400 MT/s.",
    drives: [
      { kind: "uniform", media: "NVMe", counts: [2, 4, 6], sizesTB: NVME_SIZES },
      { kind: "uniform", media: "SSD", counts: [2, 4, 6], sizesTB: SSD_SIZES },
      {
        kind: "hybrid",
        nvme: { count: 2, sizesTB: NVME_SIZES },
        hdd: { count: 4, sizesTB: [8, 12, 18] },
        minNvmeCapacityShare: null,
      },
    ],
    bootDevice: "2 x 480GB M.2 Boot Device",
    psu: "2 x 2200 W Titanium, redundant at 208-240 V only (not at 110 V)",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    sources: [
      "System-Specs-NX3035G10.pdf p.3-4 (drive configs)",
      "p.7 (CPU, memory, boot)",
      "p.8-9 (drive options, PSU)",
      "p.17 (PSU redundancy)",
      "p.18-19 (DIMM rules and installation order)",
    ],
    notes: [
      "Partner spec sheet (Oct 2026) reads \"4x NVMe + 2x HDD\" with no all-SSD option; its 102.72 TB maximum matches 2 NVMe + 4 HDD. The System Specifications PDF is kept.",
      "Hybrid NVMe capacity-share rule: not stated on this sheet (the 30% rule appears only in the NX-1175S-G10 sheet), so minNvmeCapacityShare is null.",
      "nodesPerBlock 2 (Node A, Node B); the sheet does not say whether a one-node population is supported.",
      "SSD sizes are 3.84/7.68 TB only (no 15.36 TB SSD). Hybrid is fixed at 2 NVMe + 4 HDD.",
      "The first two drives in each node hold the CVM and metadata (p.3).",
      NST_NOTE,
    ],
  },
  {
    sku: "NX-3060S-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids",
    formFactor: "2U4N",
    nodesPerBlock: 4,
    socketsPerNode: 1,
    cpus: [
      cpu(`${GR} 6517P`, 16, 3.2),
      cpu(`${GR} 6521P`, 24, 2.6),
      cpu(`${GR} 6527P`, 24, 3.0),
      cpu(`${GR} 6530P`, 32, 2.3),
      cpu(`${GR} 6731P`, 32, 2.5),
      cpu(`${GR} 6737P`, 32, 2.9),
      cpu(`${GR} 6740P`, 48, 2.1),
      cpu(`${GR} 6741P`, 48, 2.5),
    ],
    ramTotalsGiB: ramTotals([4, 8], [64, 96, 128]),
    ramNote:
      "8 DIMM slots per node. 64, 96 or 128 GB DIMMs, 4 or 8 per node, same capacity only (minimum 4); no 32 GB option. 1DPC at 6400 MT/s.",
    drives: [{ kind: "uniform", media: "NVMe", counts: [2, 4, 6], sizesTB: NVME_SIZES }],
    bootDevice: "2 x 480GB M.2 Boot Device",
    psu: "2 x 3000 W Titanium (C20/21 cables), redundant at 208-240 V only (not at 110 V)",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    sources: [
      "System-Specs-NX3060SG10.pdf p.3 (nodes, drive configs)",
      "p.8 (CPU, memory, boot)",
      "p.9 (drive options, PSU)",
      "p.17 (PSU redundancy)",
      "p.18-19 (DIMM rules and installation order)",
    ],
    notes: [
      "Sheet says the block 'supports one, two, three, or four nodes'; nodesPerBlock records the chassis maximum of 4.",
      "All-NVMe only, 2/4/6 drives per node (add in pairs). No hybrid, HDD or SATA SSD option.",
      "The sheet shows the CPU2 socket as 'no CPU' (single-socket platform).",
      NST_NOTE,
    ],
  },
  {
    sku: "NX-8150-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids",
    formFactor: "2U1N",
    nodesPerBlock: 1,
    socketsPerNode: 2,
    cpus: [
      cpu(`${GR} 6515P`, 16, 2.3),
      cpu(`${GR} 6517P`, 16, 3.2),
      cpu(`${GR} 6520P`, 24, 2.4),
      cpu(`${GR} 6527P`, 24, 3.0),
      cpu(`${GR} 6724P`, 16, 3.6),
      cpu(`${GR} 6728P`, 24, 2.7),
      cpu(`${GR} 6730P`, 32, 2.5),
      cpu(`${GR} 6737P`, 32, 2.9),
      cpu(`${GR} 6748P`, 48, 2.5),
      cpu(`${GR} 6760P`, 64, 2.2),
    ],
    ramTotalsGiB: ramTotals([8, 16, 24, 32], [64, 96, 128]),
    ramNote:
      "32 DIMM slots (16 per CPU, 2DPC). 64, 96 or 128 GB DIMMs, 8/16/24/32 per node, same capacity only; both CPUs populated, minimum 8. 96 GB included per user ruling. No 32 GB option.",
    drives: [{ kind: "uniform", media: "NVMe", counts: evens(4, 20), sizesTB: NVME_SIZES }],
    bootDevice: "2 x 480GB M.2 Boot Device",
    psu: "2 x 2000 W, redundant at 208-240 V only (not at 110 V)",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    sources: [
      "System-Specs-NX8150G10.pdf p.3 (drive configs)",
      "p.8 (CPU, boot)",
      "p.9 (memory)",
      "p.10-11 (PSU, drive options)",
      "p.18 (PSU redundancy)",
      "p.20-22 (DIMM rules and population order)",
    ],
    notes: [
      "Partner spec sheet (Oct 2026) omits 96 GB DIMMs; the PDF spec table (which lists them) is kept.",
      "Conflict: spec table (p.9) lists 96 GB DIMMs but the population table (pp.21-22) lists only 64/128 GB. User ruling: include the 96 GB totals.",
      "All-NVMe, 4 to 20 drives in even counts. Compute-only (0 drives) excluded.",
      "NVMe+NST configs (6 NVMe + 14 NST; 4 NVMe + 16 NST) excluded: NUS-only. NST rows are not modelled.",
      "No 1-socket option is listed.",
      "SED variants excluded (same capacities).",
    ],
  },
  {
    sku: "NX-8150G-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids",
    formFactor: "2U1N",
    nodesPerBlock: 1,
    socketsPerNode: 2,
    cpus: [
      cpu(`${GR} 6507P`, 8, 3.5),
      cpu(`${GR} 6515P`, 16, 2.3),
      cpu(`${GR} 6517P`, 16, 3.2),
      cpu(`${GR} 6527P`, 24, 3.0),
      cpu(`${GR} 6530P`, 32, 2.3),
      cpu(`${GR} 6724P`, 16, 3.6),
      cpu(`${GR} 6728P`, 24, 2.7),
      cpu(`${GR} 6730P`, 32, 2.5),
      cpu(`${GR} 6737P`, 32, 2.9),
    ],
    ramTotalsGiB: ramTotals([8, 16, 24, 32], [32, 64, 96, 128]),
    ramNote:
      "32 DIMM slots (16 per CPU, 2DPC). 32, 64, 96 or 128 GB DIMMs, 8/16/24/32 per node, same capacity only; both CPUs populated, minimum 8. 32 GB included per user ruling. Max 16 DIMMs with 2 x RTX Pro 6000 BSE.",
    drives: [{ kind: "uniform", media: "NVMe", counts: [4, 6, 8], sizesTB: NVME_SIZES }],
    bootDevice: "2 x 480GB M.2 Boot Device",
    psu: "2 x 2000 W, redundant at 208-240 V only (not at 110 V)",
    excluded: true,
    excludedReason: "GPU platform (NX-8150G-G10); excluded from sizing.",
    autoEligible: false,
    sources: [
      "System-Specs-NX8150GG10.pdf p.3 (drive configs)",
      "p.8 (CPU, boot)",
      "p.9 (GPU notes)",
      "p.10-12 (memory, PSU, drive options)",
      "p.18 (PSU redundancy)",
      "p.20-22 (DIMM rules and population order)",
    ],
    notes: [
      "Excluded: GPU platform. Data recorded for completeness.",
      "Conflict: spec table (p.10) lists 32 GB DIMMs but the population table (pp.21-22) omits them. User ruling: include the 32 GB totals.",
      "GPU options (0-3 depending on card) share slots with NICs; GPUs are not modelled.",
      "Operating temperature caps at 25C with an RTX Pro 6000 BSE installed (p.9).",
      "All-NVMe, 4/6/8 drives. Compute-only (0 drives) and SED variants excluded.",
    ],
  },
  {
    sku: "NX-8155AS-G10",
    vendor: "AMD",
    cpuFamily: "Turin",
    formFactor: "2U1N",
    nodesPerBlock: 1,
    socketsPerNode: 1,
    cpus: [
      cpu("AMD EPYC 9115", 16, 2.6),
      cpu("AMD EPYC 9255", 24, 3.2),
      cpu("AMD EPYC 9275F", 24, 4.1),
      cpu("AMD EPYC 9355", 32, 3.55),
      cpu("AMD EPYC 9365", 36, 3.4),
      cpu("AMD EPYC 9375F", 32, 3.8),
      cpu("AMD EPYC 9455", 48, 3.15),
      cpu("AMD EPYC 9475F", 48, 3.65),
      cpu("AMD EPYC 9555P", 64, 3.2),
      cpu("AMD EPYC 9575F", 64, 3.3),
      cpu("AMD EPYC 9655P", 96, 2.6),
      cpu("AMD EPYC 9745", 128, 2.4),
    ],
    ramTotalsGiB: ramTotals([4, 8, 12, 16, 24], [32, 64, 96, 128]),
    ramNote:
      "24 DIMM slots (12 channels x 2). 32, 64, 96 or 128 GB DIMMs, 4/8/12/16/24 per node, same capacity only (minimum 4, maximum 24).",
    drives: [{ kind: "uniform", media: "NVMe", counts: evens(4, 12), sizesTB: NVME_SIZES }],
    bootDevice: "2 x 480GB M.2 Boot Device",
    psu: "2 x 2000 W, redundant at 208-240 V only (not at 110 V)",
    excluded: true,
    excludedReason: "Storage-only (SO) node; not an HCI platform.",
    autoEligible: false,
    sources: [
      "System-Specs-NX8155ASG10.pdf p.3 (role, drive configs)",
      "p.8 (CPU, boot)",
      "p.9 (memory)",
      "p.10 (drive options)",
      "p.20 (PSU redundancy)",
      "p.21-22 (DIMM rules and installation order)",
    ],
    notes: [
      "Excluded: the sheet states the node is 'supported as a storage only (SO) node'; no HCI or compute-only role is stated.",
      "Spec and population tables agree on 32/64/96/128 GB.",
      "All-NVMe, 4 to 12 drives in even counts; SED variants excluded.",
    ],
  },
  {
    sku: "NX-8170A-G10",
    vendor: "AMD",
    cpuFamily: "Turin",
    formFactor: "1U1N",
    nodesPerBlock: 1,
    socketsPerNode: 2,
    cpus: [
      cpu("AMD EPYC 9115", 16, 2.6),
      cpu("AMD EPYC 9135", 16, 3.65),
      cpu("AMD EPYC 9175F", 16, 4.2),
      cpu("AMD EPYC 9255", 24, 3.2),
      cpu("AMD EPYC 9275F", 24, 4.1),
      cpu("AMD EPYC 9355", 32, 3.55),
      cpu("AMD EPYC 9365", 36, 3.4),
      cpu("AMD EPYC 9375F", 32, 3.8),
      cpu("AMD EPYC 9455", 48, 3.15),
      cpu("AMD EPYC 9555", 64, 3.2),
    ],
    ramTotalsGiB: ramTotals([4, 8, 12, 16, 24], [32, 64, 96, 128]),
    ramNote:
      "24 DIMM slots per the text (the board figure labels 12 per CPU). 32, 64, 96 or 128 GB DIMMs, 4/8/12/16/24 per node, same capacity only; both CPUs populated, minimum 4 (2 per CPU). 32 GB included per user ruling.",
    drives: [{ kind: "uniform", media: "NVMe", counts: evens(4, 12), sizesTB: NVME_SIZES }],
    bootDevice: null,
    psu: "2 x 2000 W Titanium, redundant at 208-240 V only (not at 110 V)",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    sources: [
      "System-Specs-NX8170AG10.pdf p.3 (roles, drive configs)",
      "p.7 (CPU)",
      "p.8 (memory)",
      "p.9 (drive options, PSU)",
      "p.18 (PSU redundancy)",
      "p.19-21 (DIMM rules and population order)",
    ],
    notes: [
      "Conflict: spec table (p.8) lists 32 GB DIMMs but the population table (pp.20-21) lists only 64/96/128 GB. User ruling: include the 32 GB totals.",
      "Inconsistency: p.19 text says 6 channels x 2 slots per CPU (24 total) while the Figure 7 board image labels 12 slots per CPU. Slot count is not used beyond the stated DIMM counts.",
      "Boot device not stated (no Boot Device row; exploded view shows 2 M.2 drives), so bootDevice is null.",
      "All-NVMe, 4 to 12 drives in even counts (even-only partial population). Compute-only and SED variants excluded.",
    ],
  },
  {
    sku: "NX-8170-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids",
    formFactor: "1U1N",
    nodesPerBlock: 1,
    socketsPerNode: 2,
    cpus: [
      cpu(`${GR} 6505P`, 12, 2.2),
      cpu(`${GR} 6507P`, 8, 3.5),
      cpu(`${GR} 6515P`, 16, 2.3),
      cpu(`${GR} 6517P`, 16, 3.2),
      cpu(`${GR} 6527P`, 24, 3.0),
      cpu(`${GR} 6530P`, 32, 2.3),
      cpu(`${GR} 6714P`, 8, 4.0),
      cpu(`${GR} 6724P`, 16, 3.6),
      cpu(`${GR} 6728P`, 24, 2.7),
      cpu(`${GR} 6736P`, 36, 2.0),
    ],
    ramTotalsGiB: ramTotals([8, 16, 24, 32], [32, 64, 96, 128]),
    ramNote:
      "32 DIMM slots (16 per CPU, 2DPC). 32, 64, 96 or 128 GB DIMMs, 8/16/24/32 per node, same capacity only; both CPUs populated, minimum 8.",
    drives: [
      { kind: "uniform", media: "NVMe", counts: evens(2, 12), sizesTB: NVME_SIZES },
      { kind: "uniform", media: "SSD", counts: evens(2, 12), sizesTB: SSD_SIZES },
    ],
    bootDevice: "2 x 480GB M.2 Boot Device",
    psu: "2 x 2000 W, redundant at 208-240 V only (not at 110 V)",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    sources: [
      "System-Specs-NX8170G10.pdf p.3 (roles, drive configs)",
      "p.7 (CPU, boot)",
      "p.8 (memory)",
      "p.9-10 (PSU, drive options)",
      "p.19-21 (DIMM rules and population order)",
    ],
    notes: [
      "Partner spec sheet (Oct 2026) memory table differs from the PDF; the PDF is kept.",
      "HCI supports all-SSD and all-NVMe, 2 to 12 drives in even counts. No hybrid (SSD+HDD) option.",
      "NVMe+NST (4 NVMe + 8 NST) is NUS-only and excluded; SED variants and compute-only excluded.",
      "SSD sizes are 3.84/7.68 TB only (no 15.36 TB SSD).",
    ],
  },
  {
    sku: "NX-8173AS-G10",
    vendor: "AMD",
    cpuFamily: "Turin",
    formFactor: "1U1N",
    nodesPerBlock: 1,
    socketsPerNode: 1,
    cpus: [
      cpu("AMD EPYC 9115", 16, 2.6),
      cpu("AMD EPYC 9135", 16, 3.65),
      cpu("AMD EPYC 9255", 24, 3.2),
      cpu("AMD EPYC 9355P", 32, 3.55),
      cpu("AMD EPYC 9365", 36, 3.4),
      cpu("AMD EPYC 9455P", 48, 3.15),
      cpu("AMD EPYC 9535", 64, 2.4),
    ],
    ramTotalsGiB: ramTotals([4, 8, 12, 16, 24], [64, 96, 128]),
    ramNote:
      "24 DIMM slots (12 channels x 2). 64, 96 or 128 GB DIMMs, 4/8/12/16/24 per node, same capacity only (minimum 4, maximum 24); no 32 GB option.",
    drives: [{ kind: "uniform", media: "NVMe", counts: evens(4, 16), sizesTB: NVME_SIZES }],
    bootDevice: "1 x 480GB M.2 Boot Device (or 512GB depending on availability)",
    psu: "2 x 1600 W, redundant at 208-240 V only (not at 110 V)",
    excluded: false,
    excludedReason: null,
    autoEligible: true,
    sources: [
      "System-Specs-NX8173ASG10.pdf p.3 (drive configs)",
      "p.8 (CPU, boot)",
      "p.9-10 (memory, PSU, drive options)",
      "p.18-19 (DIMM rules and installation order)",
    ],
    notes: [
      "Conflict: p.3 lists 4/6/8/10/12/16 NVMe drives while the p.10 spec table also lists 14. User ruling: 14 allowed (4 to 16, even counts).",
      "E3.S NVMe only, 16 bays; no SSD, HDD, hybrid, SED or NST option listed. Compute-only/NUS role not stated.",
      "Operating temperature 10-25C (p.11).",
      "TDP is stated only by core-count group (24/16-core 200 W; 64/48/36/32-core 300 W/280 W), not per SKU.",
    ],
  },
  {
    sku: "NX-9183-G10",
    vendor: "Intel",
    cpuFamily: "Granite Rapids-AP",
    formFactor: "4U1N",
    nodesPerBlock: 1,
    socketsPerNode: 2,
    cpus: [
      cpu(`${GR} 6944P`, 72, 1.8),
      cpu(`${GR} 6960P`, 72, 2.7),
      cpu(`${GR} 6972P`, 96, 2.4),
      cpu(`${GR} 6980P`, 128, 2.0),
    ],
    ramTotalsGiB: ramTotals([24], [64, 128]),
    ramNote:
      "Fixed population of exactly 24 DIMMs (1DPC). 64 or 128 GB DIMMs, same capacity only.",
    drives: [{ kind: "uniform", media: "NVMe", counts: [4, 8], sizesTB: [7.68, 15.36] }],
    bootDevice: "1 x 512GB M.2 Boot Device",
    psu: "4 x 3200 W Titanium, redundant at 208-240 V only (not at 110 V)",
    excluded: true,
    excludedReason: "GPU-required platform (supports a GPU/NIC configuration only: 4 GPUs + 3 NICs or 8 GPUs + 5 NICs).",
    autoEligible: false,
    sources: [
      "System-Specs-NX9183G10.pdf p.3-4 (drive configs, GPU/NIC rule)",
      "p.5 (GPU/NIC slots)",
      "p.9 (CPU, memory, boot)",
      "p.10 (drive options, PSU)",
      "p.19-20 (DIMM rules)",
    ],
    notes: [
      "Excluded: GPU-required platform. Data recorded for completeness.",
      "Conflict: the p.10 spec table allows 0, 4 or 8 NVMe drives; p.3 says minimum four. User ruling: minimum 4 drives.",
      "Conflict: p.19 text says 12 channels x 2 slots = 24 slots, but the board figure shows 12 single slots per CPU. Only the fixed 24-DIMM population is recorded.",
      "NVMe sizes 7.68/15.36 TB only (3.84 TB not offered). Every CPU is 'Excluded from ENERGY STAR certification'.",
      "Hypervisor: AHV only; minimum AOS 7.6 (Table 4, p.12).",
    ],
  },
];

export function findNxModel(sku: string): NxModel | null {
  return NX_MODELS.find((m) => m.sku === sku) ?? null;
}

// ---------------------------------------------------------------------------
// Generic hardware: a vendor-neutral requirement a build partner can fulfil.
// Not an NX model and never in a use case list. Bounds follow current dual-socket
// x86 servers and Nutanix limits:
//   - AHV will not start a VM with more vCPU than the host's physical cores
//     (Nutanix AHV configuration maximums), so cores per node are checked
//     against the largest VM.
//   - Up to 2 x 128 cores (AMD EPYC 9005) = 256 cores per node.
//   - Up to 2 TiB RAM per node (user ruling; AHV allows more).
//   - All-flash NVMe up to 12 x 15.36 TB = 184.32 TB raw, inside the 185 TB
//     all-flash per-node figure supported for 1-hour RPO on NCI 7.5.
// ---------------------------------------------------------------------------

export const GENERIC_SKU = "Generic";

export const GENERIC_MODEL: NxModel = {
  sku: GENERIC_SKU,
  vendor: "Intel",
  cpuFamily: "x86 (Intel Xeon or AMD EPYC)",
  formFactor: "Any",
  nodesPerBlock: 1,
  socketsPerNode: 2,
  cpus: [8, 12, 16, 20, 24, 28, 32, 36, 48, 64, 72, 96, 128].map((c) => ({ model: `${c}-core x86 CPU`, coresPerCpu: c, baseGHz: 0 })),
  ramTotalsGiB: [256, 384, 512, 768, 1024, 1536, 2048],
  ramNote: "Any balanced DIMM population giving the stated total.",
  drives: [{ kind: "uniform", media: "NVMe", counts: [2, 4, 6, 8, 10, 12], sizesTB: [1.92, 3.84, 7.68, 15.36] }],
  bootDevice: null,
  psu: "Redundant",
  excluded: false,
  excludedReason: null,
  autoEligible: false,
  sources: ["Nutanix AHV configuration maximums", "Nutanix NCI 7.5 all-flash per-node capacity"],
  notes: [],
};

export function isGenericModel(model: NxModel): boolean {
  return model.sku === GENERIC_SKU;
}

/** The CPU class a partner should quote for a given core count per socket. */
export function genericCpuClass(coresPerSocket: number): string {
  if (coresPerSocket <= 32) return "Intel Xeon Gold / Xeon 6, or AMD EPYC";
  if (coresPerSocket <= 86) return "Intel Xeon 6 / Platinum, or AMD EPYC";
  return "AMD EPYC or Intel Xeon 6 (high core count)";
}

// ---------------------------------------------------------------------------
// Use cases (SE positioning guide). NX Auto only considers the models listed
// for the chosen use case, then picks the one needing the fewest nodes, then
// the fewest cores. Small single-socket nodes (1120AS, 1175S) are ROBO/edge
// profiles and are not offered for general consolidation. GPU platforms
// (8150G, 9183) and the storage-only 8155AS stay excluded from VM sizing.
// ---------------------------------------------------------------------------

export type NxUseCase = "general" | "database" | "robo" | "vdi" | "storage";

export const NX_USE_CASES: Record<NxUseCase, { label: string; helper: string; models: string[] }> = {
  general: {
    label: "General virtualization / consolidation",
    helper: "Dual-socket platforms: NX-3035, NX-8170, NX-8150, NX-8170A.",
    models: ["NX-3035-G10", "NX-8170-G10", "NX-8150-G10", "NX-8170A-G10"],
  },
  database: {
    label: "Databases / business-critical / high memory",
    helper: "NX-8170, NX-8150 (up to 4 TB RAM), NX-8170A.",
    models: ["NX-8170-G10", "NX-8150-G10", "NX-8170A-G10"],
  },
  robo: {
    label: "ROBO / edge / small sites",
    helper: "NX-1120AS, NX-1175S, NX-3035: low cost, small node profiles.",
    models: ["NX-1120AS-G10", "NX-1175S-G10", "NX-3035-G10"],
  },
  vdi: {
    label: "Dense VDI / compute-dense, space-constrained",
    helper: "NX-3060S (2U/4-node), NX-3035. No GPU.",
    models: ["NX-3060S-G10", "NX-3035-G10"],
  },
  storage: {
    label: "Storage-heavy (Files, Objects, unstructured data)",
    helper: "NX-8173AS (16 E3.S drives), NX-8150 (up to 20 drives).",
    models: ["NX-8173AS-G10", "NX-8150-G10"],
  },
};
