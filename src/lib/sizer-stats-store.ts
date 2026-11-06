import fs from "node:fs/promises";
import path from "node:path";

// Global Simple Sizer usage totals, kept on disk next to the app (like
// data/local-config.json). Three counters only: no file names, customers, VM
// data, IPs or user identities are recorded.

export type SizerStats = { vms: number; clusters: number; solutions: number };

const STATS_PATH = path.join(process.cwd(), "data", "sizer-stats.json");
const EMPTY: SizerStats = { vms: 0, clusters: 0, solutions: 0 };

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

export async function readSizerStats(): Promise<SizerStats> {
  try {
    const v = JSON.parse(await fs.readFile(STATS_PATH, "utf8")) as Partial<SizerStats>;
    return { vms: count(v.vms), clusters: count(v.clusters), solutions: count(v.solutions) };
  } catch {
    return { ...EMPTY };
  }
}

// One server process (pm2 fork mode): chaining writes keeps increments from
// overlapping; temp file + rename keeps the file whole if the process dies.
let queue: Promise<unknown> = Promise.resolve();

export function addSizerStats(delta: SizerStats): Promise<SizerStats> {
  const run = queue.then(async () => {
    const cur = await readSizerStats();
    const next = { vms: cur.vms + delta.vms, clusters: cur.clusters + delta.clusters, solutions: cur.solutions + delta.solutions };
    await fs.mkdir(path.dirname(STATS_PATH), { recursive: true });
    const tmp = `${STATS_PATH}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next));
    await fs.rename(tmp, STATS_PATH);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}
