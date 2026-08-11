// Unit resolution for spreadsheet imports.
//
// Collector, RVTools and LiveOptics all describe the same facts in different
// columns and different units, and some exports carry no unit in the header at
// all ("Capacity", "Consumed", "Total"). Guessing from the header alone is how a
// 20 TiB estate becomes 25,000,000 TiB and the sizer asks for 341,000 nodes.
//
// So units are resolved in this order:
//   1. An explicit unit token in the header ("Capacity (MiB)") is believed —
//      but only if the resulting per-entity magnitude is physically possible.
//   2. Otherwise the scale is inferred from magnitude: try every unit and keep
//      the one that puts the average VM/host/datastore in a plausible range,
//      breaking ties toward the most typical real-world value.
//   3. If no interpretation is plausible, the value is reported as unresolved
//      rather than silently returning 0 or a nonsense number.
//
// Every resolution records what it did so the UI can show its work.

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

// Units worth testing when the header doesn't say, ordered small to large.
const CANDIDATE_UNITS: Unit[] = ["B", "KiB", "MiB", "MB", "GiB", "GB", "TiB", "TB"];

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// An explicit unit token in the header, if there is one. Checked longest-first
// so "mib" doesn't get shadowed by "b", and binary before decimal.
export function unitFromHeader(header: string): Unit | null {
  const h = normalizeHeader(header);
  const tokens: [string, Unit][] = [
    ["tib", "TiB"],
    ["gib", "GiB"],
    ["mib", "MiB"],
    ["kib", "KiB"],
    ["tbytes", "TB"],
    ["gbytes", "GB"],
    ["mbytes", "MB"],
    ["kbytes", "KB"],
    ["bytes", "B"],
    ["tb", "TB"],
    ["gb", "GB"],
    ["mb", "MB"],
    ["kb", "KB"],
  ];
  for (const [token, unit] of tokens) {
    if (h.includes(token)) return unit;
  }
  // A standalone trailing "B" ("Size B", "Capacity (B)") means bytes. This has to
  // be tested against the raw header — normalising strips the very whitespace and
  // brackets that make the B standalone ("Size B" -> "sizeb").
  if (/(?:^|[\s(\[_\-/])b[)\]]?\s*$/i.test(String(header).trim())) return "B";
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

export type Confidence = "header" | "magnitude" | "header-overridden" | "unresolved";

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

const DECIMAL_UNITS: Unit[] = ["KB", "MB", "GB", "TB"];

function score(perEntityGiB: number, band: Plausibility): number | null {
  if (!(perEntityGiB > 0)) return null;
  if (perEntityGiB < band.min || perEntityGiB > band.max) return null;
  // Distance in log space from the typical value — units are 1024x apart, so a
  // log-scale comparison is the only sensible one.
  return Math.abs(Math.log(perEntityGiB / band.typical));
}

// MiB and MB are only 2.4% apart, so magnitude can never separate them. Two
// nudges settle it: virtualization exports are overwhelmingly binary, and the
// caller may know a given tool's convention outright (Collector reports host
// memory in decimal GB). Neither can rescue an implausible value — they only
// break ties between interpretations that already passed the band check.
function adjustedScore(unit: Unit, distance: number, prefer?: Unit): number {
  let adjusted = distance;
  if (DECIMAL_UNITS.includes(unit)) adjusted += 0.12;
  if (prefer && unit === prefer) adjusted -= 0.3;
  return adjusted;
}

/**
 * Resolve a capacity column to GiB.
 *
 * @param rawTotal   Sum of the column, in its own (unknown) units.
 * @param entities   Number of things the total is spread across (VMs, hosts…).
 * @param band       What one entity plausibly looks like.
 */
export function resolveCapacity(
  header: string | null,
  rawTotal: number,
  entities: number,
  band: Plausibility,
  prefer?: Unit,
): UnitResolution {
  if (!header) return unresolved(`No ${band.label} column found.`);
  if (!(rawTotal > 0)) {
    return { header, unit: null, totalGiB: 0, perEntityGiB: 0, confidence: "unresolved", note: `"${header}" is empty or zero.` };
  }
  const count = Math.max(1, entities);
  const declared = unitFromHeader(header);

  if (declared) {
    const perEntity = toGiB(rawTotal, declared) / count;
    if (score(perEntity, band) != null) {
      return {
        header,
        unit: declared,
        totalGiB: toGiB(rawTotal, declared),
        perEntityGiB: perEntity,
        confidence: "header",
        note: `"${header}" read as ${declared} (${fmt(perEntity)} GiB ${band.label}).`,
      };
    }
  }

  // Either the header said nothing, or what it said produces an impossible
  // number. Fall back to magnitude.
  let best: { unit: Unit; distance: number; perEntity: number } | null = null;
  for (const unit of CANDIDATE_UNITS) {
    const perEntity = toGiB(rawTotal, unit) / count;
    const raw = score(perEntity, band);
    if (raw == null) continue;
    const distance = adjustedScore(unit, raw, prefer);
    if (!best || distance < best.distance) best = { unit, distance, perEntity };
  }

  if (!best) {
    const declaredNote = declared
      ? ` Header claims ${declared}, which would mean ${fmt(toGiB(rawTotal, declared) / count)} GiB ${band.label}.`
      : "";
    return {
      header,
      unit: null,
      totalGiB: null,
      perEntityGiB: null,
      confidence: "unresolved",
      note: `"${header}" could not be read as a capacity in any unit — no interpretation gives a believable ${band.label}.${declaredNote}`,
    };
  }

  return {
    header,
    unit: best.unit,
    totalGiB: toGiB(rawTotal, best.unit),
    perEntityGiB: best.perEntity,
    confidence: declared ? "header-overridden" : "magnitude",
    note: declared
      ? `"${header}" claims ${declared}, but that gives an impossible ${band.label} — read as ${best.unit} instead (${fmt(best.perEntity)} GiB ${band.label}).`
      : `"${header}" carries no unit — inferred ${best.unit} from magnitude (${fmt(best.perEntity)} GiB ${band.label}).`,
  };
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
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
        detail: "Either vCPU is overstated or host cores are understated — one of the two columns is wrong.",
      });
    }
  }

  return issues;
}
