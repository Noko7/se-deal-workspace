// Unit resolution for spreadsheet imports.
//
// Collector, RVTools and LiveOptics describe the same facts in different columns
// and units. Units are never guessed:
//   1. A unit printed in the header ("Capacity (MiB)") is authoritative.
//   2. A header with no unit ("Memory", "# Memory", "Memory Size") takes the
//      unit the tool is documented to use, from the caller's registry entry.
//   3. Otherwise the column is unresolved and contributes nothing.
// Magnitude is only ever used to *check* the result: a value that is physically
// impossible is reported so the build is blocked, never silently re-read in
// another unit.
//
// Every resolution records what it did so the UI and report can show their work.

export type Unit = "B" | "KiB" | "MiB" | "GiB" | "TiB" | "KB" | "MB" | "GB" | "TB";

// Multiplier from the given unit to one GiB.
const TO_GIB: Record<Unit, number> = {
  B: 1 / 1024 ** 3,
  KiB: 1 / 1024 ** 2,
  MiB: 1 / 1024,
  GiB: 1,
  TiB: 1024,
  KB: 1000 / 1024 ** 3,
  MB: 1000 ** 2 / 1024 ** 3,
  GB: 1000 ** 3 / 1024 ** 3,
  TB: 1000 ** 4 / 1024 ** 3,
};

export const GIB_PER_TIB = 1024;

export function toGiB(value: number, unit: Unit): number {
  return value * TO_GIB[unit];
}

export function toTiB(value: number, unit: Unit): number {
  return (value * TO_GIB[unit]) / GIB_PER_TIB;
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// The unit printed in a header, if any. Only a whole-word token counts, so
// "Number of Reads" is not megabytes and "Memory" is not a unit.
const UNIT_TOKENS: [RegExp, Unit][] = [
  [/(?:^|[^a-z])tib(?![a-z])/i, "TiB"],
  [/(?:^|[^a-z])gib(?![a-z])/i, "GiB"],
  [/(?:^|[^a-z])mib(?![a-z])/i, "MiB"],
  [/(?:^|[^a-z])kib(?![a-z])/i, "KiB"],
  [/(?:^|[^a-z])tb(?![a-z])/i, "TB"],
  [/(?:^|[^a-z])gb(?![a-z])/i, "GB"],
  [/(?:^|[^a-z])mb(?![a-z])/i, "MB"],
  [/(?:^|[^a-z])kb(?![a-z])/i, "KB"],
  [/(?:^|[^a-z])bytes?(?![a-z])/i, "B"],
];

export function unitFromHeader(header: string): Unit | null {
  const raw = String(header ?? "");
  for (const [pattern, unit] of UNIT_TOKENS) {
    if (pattern.test(raw)) return unit;
  }
  return null;
}

// What a single VM / host / datastore plausibly looks like, in GiB. The bands are
// deliberately generous — they exist to catch 1000x errors, not to second-guess
// an unusual estate. `typical` breaks ties between two units that both fit.
export type Plausibility = { min: number; max: number; typical: number; label: string };

export const PLAUSIBLE: Record<string, Plausibility> = {
  vmMemory: { min: 0.125, max: 8192, typical: 12, label: "RAM per VM" },
  vmStorage: { min: 0.5, max: 262144, typical: 150, label: "storage per VM" },
  hostMemory: { min: 8, max: 49152, typical: 512, label: "RAM per host" },
  hostStorage: { min: 50, max: 1048576, typical: 20480, label: "storage per host" },
  datastore: { min: 10, max: 4194304, typical: 20480, label: "capacity per datastore" },
};

export type Confidence = "header" | "registry" | "unresolved";

export type UnitResolution = {
  // The column that was read, or null when no candidate matched.
  header: string | null;
  unit: Unit | null;
  // Total across all rows, in GiB. Null when nothing could be resolved.
  totalGiB: number | null;
  perEntityGiB: number | null;
  confidence: Confidence;
  // Human-readable account of what happened, shown in the parse audit.
  note: string;
};

export function unresolved(note: string): UnitResolution {
  return { header: null, unit: null, totalGiB: null, perEntityGiB: null, confidence: "unresolved", note };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * What one entity typically holds, in the column's own units, for the
 * plausibility check only. The median row is used because real exports carry
 * corrupt rows (one masked Collector file has a single 8.4 EiB partition) that
 * would swamp a mean; scaling by rows-per-entity turns it into a per-VM or
 * per-host figure.
 */
function perEntityEstimate(values: number[], entities: number): number {
  const positive = values.filter((v) => v > 0);
  if (!positive.length) return 0;
  const rowsPerEntity = positive.length / Math.max(1, entities);
  return median(positive) * Math.max(1, rowsPerEntity);
}

/**
 * Resolve a capacity column to GiB.
 *
 * @param values        Every value in the column.
 * @param entities      Number of things the column is spread across (VMs, hosts).
 * @param band          What one entity plausibly holds; used only to report an
 *                      impossible result, never to change the unit.
 * @param registryUnit  The tool's documented unit for a header that prints none.
 */
export function resolveCapacity(
  header: string | null,
  values: number[],
  entities: number,
  band: Plausibility,
  registryUnit?: Unit,
): UnitResolution {
  if (!header) return unresolved(`No ${band.label} column found.`);
  const declared = unitFromHeader(header);
  const unit = declared ?? registryUnit ?? null;
  if (!unit) {
    return {
      header,
      unit: null,
      totalGiB: null,
      perEntityGiB: null,
      confidence: "unresolved",
      note: `"${header}" prints no unit and this tool has no documented unit for it, so it was not used.`,
    };
  }
  const confidence: Confidence = declared ? "header" : "registry";
  const rawTotal = values.reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
  const perEntity = toGiB(perEntityEstimate(values, entities), unit);
  const source = declared ? `the header states ${unit}` : `the export prints no unit; this tool documents ${unit}`;
  const typical = `${fmtDecimal(perEntity * GB_PER_GIB)} GB ${band.label}`;
  const plausible = !(rawTotal > 0) || (perEntity >= band.min && perEntity <= band.max);
  return {
    header,
    unit,
    totalGiB: toGiB(rawTotal, unit),
    perEntityGiB: perEntity,
    confidence,
    note: plausible
      ? `"${header}" read as ${unit} (${source}); typical ${typical}.`
      : `"${header}" read as ${unit} (${source}), which gives an impossible ${typical}. The column or the export is wrong; the build is blocked until it is checked.`,
  };
}

const GB_PER_GIB = 1024 ** 3 / 1e9;

function fmtDecimal(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 100) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(3);
}

// ---------------------------------------------------------------------------
// Whole-environment sanity checks
// ---------------------------------------------------------------------------

export type PlausibilityIssue = {
  field: string;
  observed: string;
  expected: string;
  detail: string;
};

export type SanityInput = {
  vms: number;
  hosts: number;
  vcpu: number;
  vmRamGiB: number;
  vmStorageProvisionedTiB: number;
  vmStorageConsumedTiB: number;
  hostCores: number;
  hostRamGiB: number;
};

function band(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

// Catches the class of error that produces an absurd build. Anything returned
// here blocks the recommendation — an SE must never be handed a number that the
// arithmetic itself says is impossible.
export function checkPlausibility(input: SanityInput): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const perVm = (value: number) => (input.vms > 0 ? value / input.vms : 0);
  const perHost = (value: number) => (input.hosts > 0 ? value / input.hosts : 0);

  if (input.vms > 0) {
    const vcpuPerVm = perVm(input.vcpu);
    if (!band(vcpuPerVm, 0.5, 128)) {
      issues.push({
        field: "vCPU per VM",
        observed: vcpuPerVm.toFixed(1),
        expected: "0.5 – 128",
        detail: "The vCPU column probably isn't a vCPU count. Check the VM sheet's CPU column.",
      });
    }
    const ramPerVm = perVm(input.vmRamGiB);
    if (!band(ramPerVm, PLAUSIBLE.vmMemory.min, PLAUSIBLE.vmMemory.max)) {
      issues.push({
        field: "RAM per VM",
        observed: `${ramPerVm.toFixed(1)} GiB`,
        expected: `${PLAUSIBLE.vmMemory.min} – ${PLAUSIBLE.vmMemory.max} GiB`,
        detail: "VM memory was read in the wrong unit, or the memory column wasn't found.",
      });
    }
    const storagePerVmGiB = perVm(input.vmStorageProvisionedTiB * GIB_PER_TIB);
    if (input.vmStorageProvisionedTiB > 0 && !band(storagePerVmGiB, PLAUSIBLE.vmStorage.min, PLAUSIBLE.vmStorage.max)) {
      issues.push({
        field: "Storage per VM",
        observed: `${(storagePerVmGiB / GIB_PER_TIB).toFixed(2)} TiB`,
        expected: `${PLAUSIBLE.vmStorage.min} GiB – ${(PLAUSIBLE.vmStorage.max / GIB_PER_TIB).toFixed(0)} TiB`,
        detail: "Storage was read in the wrong unit, or a shared datastore was counted once per host.",
      });
    }
  }

  if (input.hosts > 0) {
    const coresPerHost = perHost(input.hostCores);
    if (!band(coresPerHost, 2, 512)) {
      issues.push({
        field: "Cores per host",
        observed: coresPerHost.toFixed(1),
        expected: "2 – 512",
        detail: "Sockets and cores-per-socket may have been multiplied twice, or the wrong column was read.",
      });
    }
    const ramPerHost = perHost(input.hostRamGiB);
    if (input.hostRamGiB > 0 && !band(ramPerHost, PLAUSIBLE.hostMemory.min, PLAUSIBLE.hostMemory.max)) {
      issues.push({
        field: "RAM per host",
        observed: `${ramPerHost.toFixed(0)} GiB`,
        expected: `${PLAUSIBLE.hostMemory.min} – ${PLAUSIBLE.hostMemory.max} GiB`,
        detail: "Host memory was read in the wrong unit.",
      });
    }
  }

  if (input.vmStorageConsumedTiB > input.vmStorageProvisionedTiB * 1.05 && input.vmStorageProvisionedTiB > 0) {
    issues.push({
      field: "Consumed vs provisioned storage",
      observed: `${input.vmStorageConsumedTiB.toFixed(1)} TiB used of ${input.vmStorageProvisionedTiB.toFixed(1)} TiB`,
      expected: "consumed ≤ provisioned",
      detail: "The consumed and provisioned columns are in different units, or they were swapped.",
    });
  }

  if (input.hostCores > 0 && input.vcpu > 0) {
    const ratio = input.vcpu / input.hostCores;
    if (ratio > 64) {
      issues.push({
        field: "vCPU : pCore ratio",
        observed: `${ratio.toFixed(1)}:1`,
        expected: "≤ 64:1",
        detail: "Either vCPU is overstated or host cores are understated. One of the two columns is wrong.",
      });
    }
  }

  return issues;
}
