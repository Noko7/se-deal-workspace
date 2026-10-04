// Geometry checks for the exported proposal deck.
//
// The deck is assembled from absolute inch coordinates, so a layout regression
// shows up as text boxes sitting on top of each other rather than as a thrown
// error. These tests build a real .pptx, read the slide XML back, and assert
// that no two text frames on a slide intersect -- which is the only way to be
// sure the cluster utilization block (the part most likely to be read closely)
// actually has the clearance its row-pitch math claims.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
// pptxgenjs writes the .pptx with jszip, so reading it back with the same
// library needs no dependency the exporter does not already pull in.
import JSZip from "jszip";

import { addHardwareOption, buildProposalDoc, capacityRows, formatPct, type CurrentEnvironment, type ProposalDoc } from "@/lib/proposal-doc";
import { buildSampleAlternateScenario, buildSampleScenario } from "@/lib/proposal-sample";
import { exportProposalToPptx } from "@/lib/proposal-pptx";
import { newLicenseLine } from "@/lib/license-catalog";
import { allLicensingPages } from "@/lib/product-editions";
import type { ProposalCluster } from "@/lib/sizer-import";

const EMU_PER_INCH = 914400;
const PAGE_W = 13.333;
const PAGE_H = 7.5;

type Frame = { x: number; y: number; w: number; h: number; text: string };

function buildTwoOptionDoc(): ProposalDoc {
  let doc = buildProposalDoc(buildSampleScenario("Imogen Hartwell"), "primary.json");
  doc = addHardwareOption(doc, buildSampleAlternateScenario("Imogen Hartwell"), "consolidated.json");
  // Exercise the add-on licensing pages too, not just the base platform.
  doc.licensing.lines.push(newLicenseLine("NUS", { tier: "Ultimate", qty: 420 }));
  doc.licensing.lines.push(newLicenseLine("CloudManager", { tier: "Pro", qty: 544 }));
  return doc;
}

async function renderDeck(doc: ProposalDoc): Promise<Map<string, Frame[]>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-deck-"));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await exportProposalToPptx(doc, null, {}, {}, {});
  } finally {
    process.chdir(cwd);
  }

  const file = fs.readdirSync(dir).find((f) => f.endsWith(".pptx"));
  assert.ok(file, "exporter wrote a .pptx file");

  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, file as string)));
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const slides = new Map<string, Frame[]>();
  for (const name of slideNames) {
    const xml = await zip.file(name)!.async("string");
    slides.set(name, textFrames(xml));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return slides;
}

/** Every text run in the exported deck, tables included. */
async function renderDeckRuns(doc: ProposalDoc): Promise<string[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-runs-"));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await exportProposalToPptx(doc, null, {}, {}, {});
  } finally {
    process.chdir(cwd);
  }
  const file = fs.readdirSync(dir).find((f) => f.endsWith(".pptx")) as string;
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, file)));
  const runs: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const xml = await zip.file(name)!.async("string");
    for (const m of xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) runs.push(m[1]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return runs;
}

// Pull every shape that actually carries text, with its position in inches.
// Shapes without an <a:t> run are backgrounds, rules and bars, which are
// allowed (and intended) to sit underneath the text.
function textFrames(xml: string): Frame[] {
  const frames: Frame[] = [];
  for (const sp of xml.split("<p:sp>").slice(1)) {
    const body = sp.split("</p:sp>")[0];
    const off = body.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    const ext = body.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!off || !ext) continue;
    const runs = [...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
    const text = runs.join(" ").trim();
    if (!text) continue;
    frames.push({
      x: Number(off[1]) / EMU_PER_INCH,
      y: Number(off[2]) / EMU_PER_INCH,
      w: Number(ext[1]) / EMU_PER_INCH,
      h: Number(ext[2]) / EMU_PER_INCH,
      text,
    });
  }
  return frames;
}

// Boxes are allowed to touch, so require a real area of intersection before
// calling it an overlap.
function intersects(a: Frame, b: Frame): boolean {
  const EPS = 0.002;
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > EPS && dy > EPS;
}

test("no two text boxes overlap on any slide", async () => {
  const slides = await renderDeck(buildTwoOptionDoc());
  assert.ok(slides.size > 20, `expected a full deck, got ${slides.size} slides`);

  const collisions: string[] = [];
  for (const [name, frames] of slides) {
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        if (intersects(frames[i], frames[j])) {
          collisions.push(
            `${name}: "${frames[i].text.slice(0, 40)}" overlaps "${frames[j].text.slice(0, 40)}"`,
          );
        }
      }
    }
  }
  assert.deepEqual(collisions, [], `overlapping text boxes:\n${collisions.join("\n")}`);
});

test("every text box stays inside the slide", async () => {
  const slides = await renderDeck(buildTwoOptionDoc());
  const escapes: string[] = [];
  for (const [name, frames] of slides) {
    for (const f of frames) {
      if (f.x < -0.01 || f.y < -0.01 || f.x + f.w > PAGE_W + 0.01 || f.y + f.h > PAGE_H + 0.01) {
        escapes.push(`${name}: "${f.text.slice(0, 40)}" at ${f.x.toFixed(2)},${f.y.toFixed(2)} ${f.w.toFixed(2)}x${f.h.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(escapes, [], `text outside the slide:\n${escapes.join("\n")}`);
});

test("cluster utilization percentages are printed, not left as raw floats", async () => {
  const slides = await renderDeck(buildTwoOptionDoc());
  const frames = [...slides.values()].flat();

  // One standalone "NN% utilized" caption per capacity row, on every cluster
  // slide across both proposed options: 5 clusters x 3 rows.
  const captions = frames.filter((f) => /^\d+(\.\d)?% utilized$/.test(f.text));
  assert.equal(captions.length, 15, `expected one caption per capacity row, got ${captions.length}`);

  // Nowhere in the deck should a percentage keep more than one decimal. Sizer
  // reports figures like 61.43076923076923, and interpolating one raw would be
  // the regression this guards against.
  const raw = frames.filter((f) => /\d+\.\d{2,}\s*%/.test(f.text));
  assert.deepEqual(raw.map((f) => f.text), [], "percentages must be formatted to one decimal");
});

test("every portfolio product gets a licensing ladder and matrix, laid out cleanly", async () => {
  const doc = buildTwoOptionDoc();
  doc.options.includeAllLicensingPages = true;
  const slides = await renderDeck(doc);

  const titles = [...slides.values()].flat().map((f) => f.text);
  // Tier counts differ per product (one, two and three-tier ladders all share
  // one renderer), so cover the whole registry rather than a sample.
  for (const lic of allLicensingPages()) {
    assert.ok(titles.includes(`${lic.name} Editions`), `missing ladder page for ${lic.abbrev}`);
    assert.ok(titles.includes(`${lic.name} Capabilities`), `missing matrix page for ${lic.abbrev}`);
  }

  const collisions: string[] = [];
  for (const [name, frames] of slides) {
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        if (intersects(frames[i], frames[j])) collisions.push(`${name}: ${frames[i].text} / ${frames[j].text}`);
      }
    }
  }
  assert.deepEqual(collisions, [], `overlapping text boxes:\n${collisions.join("\n")}`);
});

// A small but complete environment, shaped the way parseSizerWorkbook returns
// one, so the current-estate slides render against realistic data.
function sampleEnvironment(): CurrentEnvironment {
  const hardwareModels = [
    {
      model: "PowerEdge R740", vendor: "Dell", cpuModel: "Intel Xeon Gold 6248", hostCount: 6,
      socketsPerHost: 2, coresPerSocket: 20, coresPerHost: 40, ramPerHostGiB: 768,
      storagePerHostTiB: 12, cpuCores: 240, memoryGiB: 4608, storageTiB: 72,
    },
    {
      model: "PowerEdge R750", vendor: "Dell", cpuModel: "Intel Xeon Gold 6338", hostCount: 4,
      socketsPerHost: 2, coresPerSocket: 32, coresPerHost: 64, ramPerHostGiB: 1024,
      storagePerHostTiB: 16, cpuCores: 256, memoryGiB: 4096, storageTiB: 64,
    },
  ];
  const slice = (vms: number) => ({
    vms, vcpu: vms * 4, ramGiB: vms * 16,
    diskProvisionedTiB: vms * 0.4, partitionConfiguredTiB: vms * 0.4, partitionConsumedTiB: vms * 0.25,
  });
  const parsed = {
    source: "rvtools" as const,
    sourceDetection: "manual" as const,
    fileName: "hollis-ridge-rvtools.xlsx",
    fileSizeBytes: 482_113,
    analyzedAt: new Date().toISOString(),
    datacenters: 2, clusters: 2, hosts: 10, totalVms: 310,
    avgVcpuPerVm: 4, vcpuPcoreRatio: 2.5,
    totalCpuCores: 496, consumedCpuCores: 214,
    totalMemoryGiB: 8704, consumedMemoryGiB: 5120,
    totalStorageTiB: 124, consumedStorageTiB: 77.5,
    aggVcpu: 1240, aggRamGiB: 4960,
    aggStorageProvisionedTiB: 124, aggStorageConsumedTiB: 77.5,
    maxVmVcpu: 32, maxVmRamGiB: 384,
    observed: null,
    powerStateKnown: true,
    all: slice(310), poweredOn: slice(287), poweredOff: slice(23),
    guestOs: [
      { name: "Windows Server 2019", count: 148 },
      { name: "RHEL 8", count: 74 },
      { name: "Ubuntu 22.04", count: 41 },
      { name: "Windows Server 2016", count: 29 },
      { name: "CentOS 7", count: 12 },
      { name: "SUSE 15", count: 4 },
      { name: "Debian 11", count: 2 },
    ],
    topVms: [], vms: [], snapshots: 63,
    hostCpuUtilPct: 43.1, hostMemoryUtilPct: 58.8,
    sheetsFound: ["vHost", "vInfo"], audit: [], plausibility: [],
    clusterDetails: [
      {
        id: "c1", name: "PROD-A", datacenter: "Ashgate", moid: null,
        hosts: 6, hostRecords: [], topVms: [],
        hostCpuUtilPct: 46.2, hostMemoryUtilPct: 61.4,
        totalVms: 190, avgVcpuPerVm: 4, vcpuPcoreRatio: 2.6,
        hardwareModels: [hardwareModels[0]],
        aggVcpu: 760, aggRamGiB: 3040,
        aggStorageProvisionedTiB: 76, aggStorageConsumedTiB: 47,
        maxVmVcpu: 32, maxVmRamGiB: 384,
        totalCpuCores: 240, consumedCpuCores: 110,
        totalMemoryGiB: 4608, consumedMemoryGiB: 2800,
        totalStorageTiB: 76, consumedStorageTiB: 47,
        observed: null, powerStateKnown: true,
        all: slice(190), poweredOn: slice(178), poweredOff: slice(12),
      },
      {
        id: "c2", name: "PROD-B", datacenter: "Marlow", moid: null,
        hosts: 4, hostRecords: [], topVms: [],
        hostCpuUtilPct: 38.7, hostMemoryUtilPct: 54.9,
        totalVms: 120, avgVcpuPerVm: 4, vcpuPcoreRatio: 2.3,
        hardwareModels: [hardwareModels[1]],
        aggVcpu: 480, aggRamGiB: 1920,
        aggStorageProvisionedTiB: 48, aggStorageConsumedTiB: 30.5,
        maxVmVcpu: 24, maxVmRamGiB: 256,
        totalCpuCores: 256, consumedCpuCores: 104,
        totalMemoryGiB: 4096, consumedMemoryGiB: 2320,
        totalStorageTiB: 48, consumedStorageTiB: 30.5,
        observed: null, powerStateKnown: true,
        all: slice(120), poweredOn: slice(109), poweredOff: slice(11),
      },
    ],
    notes: [],
  } as unknown as CurrentEnvironment["parsed"];
  return { parsed, sourceFile: "hollis-ridge-rvtools.xlsx", source: "rvtools" };
}

test("the current-estate section renders cleanly when an environment is attached", async () => {
  const doc = buildTwoOptionDoc();
  doc.environment = sampleEnvironment();
  const slides = await renderDeck(doc);
  const titles = [...slides.values()].flat().map((f) => f.text);

  for (const expected of ["Where you are today", "Environment Overview", "Existing Host Hardware", "Existing Clusters", "Today Versus the Proposal"]) {
    assert.ok(titles.includes(expected), `missing current-estate slide: ${expected}`);
  }

  const collisions: string[] = [];
  for (const [name, frames] of slides) {
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        if (intersects(frames[i], frames[j])) collisions.push(`${name}: "${frames[i].text}" / "${frames[j].text}"`);
      }
    }
  }
  assert.deepEqual(collisions, [], `overlapping text boxes:\n${collisions.join("\n")}`);

  // Section numbering is positional, so adding the estate section must renumber
  // the ones that follow rather than leaving two "Part one" dividers.
  const parts = titles.filter((t) => /^PART (ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN)$/.test(t));
  assert.deepEqual(parts, ["PART ONE", "PART TWO", "PART THREE", "PART FOUR", "PART FIVE"], `unexpected section numbering: ${parts.join(", ")}`);
});

test("a deck without an environment export is unchanged", async () => {
  const slides = await renderDeck(buildTwoOptionDoc());
  const titles = [...slides.values()].flat().map((f) => f.text);
  assert.ok(!titles.includes("Where you are today"), "estate section leaked into a deck with no export");
  const parts = titles.filter((t) => /^PART (ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN)$/.test(t));
  assert.deepEqual(parts, ["PART ONE", "PART TWO", "PART THREE", "PART FOUR"]);
});

test("no slide text anywhere contains an em dash", async () => {
  const doc = buildTwoOptionDoc();
  doc.environment = sampleEnvironment();
  doc.options.includeAllLicensingPages = true;

  // Scans every text run in the file, including table cells. The frame-based
  // helpers above only see shapes, so a placeholder glyph inside a table would
  // otherwise slip through.
  const runs = await renderDeckRuns(doc);
  const offenders = runs.filter((t) => t.includes("\u2014"));
  assert.deepEqual([...new Set(offenders)], [], "em dashes are a hard product constraint");
});

test("storage utilization is weighted across both tiers", () => {
  const hybrid: ProposalCluster = {
    name: "Hybrid",
    solutionType: null,
    nodes: 4,
    capacity: { cores: 128, ramGiB: 2048, ssdTiB: 30, hddTiB: 90 },
    // Flash is nearly full while the much larger HDD tier is mostly empty, so
    // taking the SSD figure alone would overstate storage use by ~3x.
    utilization: { cpu: 44, ram: 51, storage: (88 * 30 + 20 * 90) / 120, ssd: 88, hdd: 20 },
    failover: { nMinus1: 60, nMinus2: null },
    models: [],
    license: null,
    externalStorage: null,
  };
  const storage = capacityRows(hybrid).find((r) => r.label === "Usable Storage");
  assert.ok(storage);
  assert.equal(storage.pctLabel, "37%");
  assert.match(storage.detail ?? "", /Flash 88%/);
  assert.match(storage.detail ?? "", /HDD 20%/);
});

test("percentages render at one decimal without a trailing zero", () => {
  assert.equal(formatPct(61.43076923076923), "61.4");
  assert.equal(formatPct(38), "38");
  assert.equal(formatPct(100), "100");
  assert.equal(formatPct(0), "0");
});
