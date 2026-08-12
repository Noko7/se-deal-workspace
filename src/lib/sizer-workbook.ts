// Simple Sizer — Excel export (ExcelJS, browser-side).
//
// Mirrors what the Collector-Formatter / RVTools-Formatter Python scripts
// produce: an aggregate summary, per-cluster sections with host detail, the
// recommended build, and a validation sheet showing exactly which column and
// unit every number came from. Built in memory and handed back as a Blob —
// nothing is uploaded or persisted.

import ExcelJS from "exceljs";
import {
  applyAdjustment,
  cpuStatisticLabel,
  vmCpuContribution,
  workloadCpuSummary,
  type ParsedEnvironment,
  type SizerSettings,
  type SizingPlan,
} from "@/lib/simple-sizer-core";
import { SIZING_RULES, utilizationBasisLabel } from "@/lib/sizing-guidance";
import { storageTB } from "@/lib/sizer-format";
import { UNIT_FOOTNOTE } from "@/lib/sizer-format";

const IRIS = "FF7855FA";
const IRIS_LIGHT = "FFF3F0FF";
const CHARCOAL = "FF313131";
const BAND = "FFF7F7F7";
const GRID = "FFD7D7D7";

type Cell = string | number | null;

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: IRIS } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: GRID } },
      left: { style: "thin", color: { argb: GRID } },
      bottom: { style: "thin", color: { argb: GRID } },
      right: { style: "thin", color: { argb: GRID } },
    };
  });
  row.height = 26;
}

function styleBody(ws: ExcelJS.Worksheet, firstDataRow: number) {
  for (let r = firstDataRow; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    row.eachCell((cell) => {
      cell.font = { size: 10 };
      cell.border = {
        top: { style: "hair", color: { argb: GRID } },
        left: { style: "hair", color: { argb: GRID } },
        bottom: { style: "hair", color: { argb: GRID } },
        right: { style: "hair", color: { argb: GRID } },
      };
      if (typeof cell.value === "number") cell.alignment = { horizontal: "right" };
    });
    if ((r - firstDataRow) % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      });
    }
  }
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 46) {
  ws.columns.forEach((column) => {
    let longest = min;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const text = cell.value == null ? "" : String(cell.value);
      longest = Math.max(longest, Math.min(max, text.length + 2));
    });
    column.width = longest;
  });
}

function sheetTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: CHARCOAL } };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, span);
  const subCell = ws.getCell(2, 1);
  subCell.value = subtitle;
  subCell.font = { size: 9, italic: true, color: { argb: "FF757575" } };
  ws.getRow(2).height = 16;
}

function addTable(ws: ExcelJS.Worksheet, headers: string[], rows: Cell[][], startRow: number): number {
  const header = ws.getRow(startRow);
  headers.forEach((h, i) => {
    header.getCell(i + 1).value = h;
  });
  styleHeaderRow(header);
  rows.forEach((cells, r) => {
    const row = ws.getRow(startRow + 1 + r);
    cells.forEach((value, i) => {
      row.getCell(i + 1).value = value;
    });
  });
  return startRow + rows.length + 1;
}

// --- sheets -----------------------------------------------------------------

function buildSummary(wb: ExcelJS.Workbook, parsed: ParsedEnvironment, plan: SizingPlan, settings: SizerSettings) {
  const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  sheetTitle(ws, "Simple Sizer summary", `${parsed.fileName} · analyzed ${new Date(parsed.analyzedAt).toLocaleString()}`, 4);

  let row = 4;
  const section = (label: string) => {
    ws.mergeCells(row, 1, row, 4);
    const cell = ws.getCell(row, 1);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: "FF5E3FC2" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: IRIS_LIGHT } };
    ws.getRow(row).height = 20;
    row += 1;
  };

  section("Current environment");
  row = addTable(
    ws,
    ["Metric", "All VMs", "Powered on", "Powered off"],
    [
      ["VMs", parsed.all.vms, parsed.poweredOn.vms, parsed.poweredOff.vms],
      ["vCPU", parsed.all.vcpu, parsed.poweredOn.vcpu, parsed.poweredOff.vcpu],
      ["VM RAM (GB)", Math.round(parsed.all.ramGiB), Math.round(parsed.poweredOn.ramGiB), Math.round(parsed.poweredOff.ramGiB)],
      [
        "Provisioned storage (TB)",
        storageTB(parsed.all.partitionConfiguredTiB),
        storageTB(parsed.poweredOn.partitionConfiguredTiB),
        storageTB(parsed.poweredOff.partitionConfiguredTiB),
      ],
      [
        "Consumed storage (TB)",
        storageTB(parsed.all.partitionConsumedTiB),
        storageTB(parsed.poweredOn.partitionConsumedTiB),
        storageTB(parsed.poweredOff.partitionConsumedTiB),
      ],
    ],
    row,
  );
  row += 1;

  section("Physical infrastructure");
  row = addTable(
    ws,
    ["Metric", "Value", "", ""],
    [
      ["Datacenters", parsed.datacenters ?? "-", "", ""],
      ["Clusters", parsed.clusters, "", ""],
      ["Hosts", parsed.hosts, "", ""],
      ["Host physical cores", Math.round(parsed.totalCpuCores), "", ""],
      ["Host RAM (GB)", Math.round(parsed.totalMemoryGiB), "", ""],
      ["vCPU : pCore ratio", parsed.vcpuPcoreRatio, "", ""],
      [
        "Physical cores in use",
        parsed.observed?.cpuPCores != null ? Math.round(parsed.observed.cpuPCores) : "not measured",
        parsed.observed?.cpuPCores != null && parsed.totalCpuCores > 0
          ? `${((parsed.observed.cpuPCores / parsed.totalCpuCores) * 100).toFixed(1)}% of installed`
          : "",
        parsed.observed ? `${utilizationBasisLabel(parsed.observed.basis)}, ${parsed.observed.source}` : "",
      ],
      ["Snapshots", parsed.snapshots ?? "-", "", ""],
    ],
    row,
  );
  row += 1;

  if (plan.blockers.length) {
    section("Recommendation withheld: inputs failed validation");
    row = addTable(
      ws,
      ["Field", "Observed", "Expected", "Detail"],
      plan.blockers.map((b) => [b.field, b.observed, b.expected, b.detail]),
      row,
    );
    row += 1;
  } else {
    const build = plan.consolidated;
    section("Recommended Nutanix build");
    row = addTable(
      ws,
      ["Metric", "Value", "", ""],
      [
        ["Node class", `${plan.profile.label} (${plan.profile.family})`, "", ""],
        ["Nodes", plan.totalNodes, "", ""],
        ["Clusters", plan.totalClusters, "", ""],
        ["Replication factor", `RF${build.effectiveRf}`, "", ""],
        ["HA failover", `N+${build.failoverHosts}`, "", ""],
        ["Licence tier", build.licenseTier.tier, "", ""],
        ["pCores per node", plan.profile.cores, "", ""],
        ["RAM per node (GB)", build.perNode.ramGiB, "", ""],
        ["Raw storage per node (TB)", storageTB(build.perNode.storageTiB), "", ""],
        ["Total pCores", plan.totals.cores, "", ""],
        ["Total RAM (GB)", plan.totals.ramGiB, "", ""],
        ["Total raw storage (TB)", storageTB(plan.totals.rawStorageTiB), "", ""],
        ["CPU headroom", `${(100 - build.headroom.cpuPct).toFixed(1)}%`, "", ""],
        ["Memory headroom", `${(100 - build.headroom.ramPct).toFixed(1)}%`, "", ""],
        ["Capacity headroom", `${(100 - build.headroom.storagePct).toFixed(1)}%`, "", ""],
      ],
      row,
    );
    row += 1;
  }

  section("Assumptions");
  row = addTable(
    ws,
    ["Setting", "Value", "", ""],
    [
      ["Sized against", settings.workloadBasis === "poweredOn" ? "Powered-on VMs" : "All VMs", "", ""],
      [
        "CPU demand from",
        `Per-VM ${cpuStatisticLabel(plan.consolidated.workload.cpu.statistic)}`,
        workloadCpuSummary(plan.consolidated.workload.cpu, settings.targetUtilizationPct, settings.cpuStatistic),
        "",
      ],
      ["Memory demand from", "Provisioned (always)", "Never sized from consumed memory, so a quiet estate cannot undersize it.", ""],
      [
        "Target utilization",
        `${settings.targetUtilizationPct}%`,
        "Workload plus CVM and Prism Central, across CPU, memory and capacity.",
        "",
      ],
      [
        "Cluster topology",
        settings.nodesPerCluster === "auto"
          ? `Auto (fill to ${SIZING_RULES.maxNodesPerCluster})`
          : `${settings.nodesPerCluster} nodes per cluster`,
        `${plan.totalClusters} cluster${plan.totalClusters === 1 ? "" : "s"}, ${plan.totalNodes} nodes in total.`,
        "",
      ],
      ["VMs excluded by hand", plan.consolidated.workload.excludedVms, "", ""],
      ["vCPU : pCore", `${settings.vcpuToPcoreRatio}:1`, "Only used for VMs with no telemetry.", ""],
      [
        "Replication factor",
        settings.rf === "auto" ? `Auto (RF3 at ${SIZING_RULES.autoRf3AtNodes}+ nodes)` : `RF${settings.rf}`,
        "",
        "",
      ],
      ["HA failover", `N+${settings.failoverHosts}`, "Absorbed by the utilization target rather than added as a spare node.", ""],
      ["Storage basis", settings.storageBasis, "", ""],
      [
        "Data reduction",
        settings.storageEfficiency === "ecx" ? "EC-X" : settings.storageEfficiency === "compression" ? "Compression (~30%)" : "None",
        "",
        "",
      ],
    ],
    row,
  );

  row += 1;
  ws.mergeCells(row, 1, row, 4);
  const note = ws.getCell(row, 1);
  note.value = UNIT_FOOTNOTE;
  note.font = { size: 9, italic: true, color: { argb: "FF757575" } };
  note.alignment = { wrapText: true };

  styleBody(ws, 4);
  autoWidth(ws, 12, 60);
}

function buildClusters(wb: ExcelJS.Workbook, parsed: ParsedEnvironment, plan: SizingPlan) {
  const ws = wb.addWorksheet("Existing Clusters", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = [
    "Cluster",
    "Datacenter",
    "Hosts",
    "VMs",
    "Powered on",
    "Powered off",
    "vCPU",
    "Host pCores",
    "pCores in use",
    "CPU used %",
    "vCPU:pCore",
    "Avg vCPU/VM",
    "VM RAM (GB)",
    "Host RAM (GB)",
    "Provisioned (TB)",
    "Consumed (TB)",
    "Cores/node",
    "RAM/node (GB)",
    "Storage/node (TB)",
    "Largest VM vCPU",
    "Largest VM RAM (GB)",
    "Nodes needed",
  ];
  sheetTitle(ws, "Existing clusters", "Every cluster in the export, with per-node figures and the Nutanix nodes it would take on its own.", headers.length);

  const nodesByCluster = new Map(plan.perCluster.map(({ source, build }) => [source.id, build.nodes]));
  const rows: Cell[][] = parsed.clusterDetails.map((c) => [
    c.name,
    c.datacenter ?? "-",
    c.hosts,
    c.all.vms,
    c.poweredOn.vms,
    c.poweredOff.vms,
    c.all.vcpu,
    Math.round(c.totalCpuCores),
    c.consumedCpuCores != null ? Math.round(c.consumedCpuCores) : null,
    c.consumedCpuCores != null && c.totalCpuCores > 0
      ? Number(((c.consumedCpuCores / c.totalCpuCores) * 100).toFixed(1))
      : null,
    c.vcpuPcoreRatio,
    c.avgVcpuPerVm,
    Math.round(c.all.ramGiB),
    Math.round(c.totalMemoryGiB),
    storageTB(c.aggStorageProvisionedTiB),
    storageTB(c.aggStorageConsumedTiB),
    c.hosts > 0 ? Number((c.totalCpuCores / c.hosts).toFixed(1)) : null,
    c.hosts > 0 ? Number((c.totalMemoryGiB / c.hosts).toFixed(1)) : null,
    c.hosts > 0 ? storageTB(c.aggStorageProvisionedTiB / c.hosts) : null,
    c.maxVmVcpu,
    c.maxVmRamGiB,
    nodesByCluster.get(c.id) ?? null,
  ]);

  addTable(ws, headers, rows, 4);
  styleBody(ws, 5);
  autoWidth(ws, 11, 34);
}

function buildHardware(wb: ExcelJS.Workbook, parsed: ParsedEnvironment) {
  const ws = wb.addWorksheet("Hardware", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = [
    "Cluster",
    "Vendor",
    "Model",
    "CPU model",
    "Hosts",
    "Sockets/host",
    "Cores/socket",
    "Cores/host",
    "RAM/host (GB)",
    "Storage/host (TB)",
    "Group cores",
    "Group RAM (GB)",
    "Group storage (TB)",
  ];
  sheetTitle(ws, "Hardware inventory", "Distinct hardware configurations within each cluster.", headers.length);

  const rows: Cell[][] = [];
  for (const cluster of parsed.clusterDetails) {
    for (const model of cluster.hardwareModels) {
      rows.push([
        cluster.name,
        model.vendor ?? "Unknown",
        model.model,
        model.cpuModel ?? "-",
        model.hostCount,
        model.socketsPerHost,
        model.coresPerSocket,
        model.coresPerHost,
        model.ramPerHostGiB,
        storageTB(model.storagePerHostTiB),
        model.cpuCores,
        model.memoryGiB,
        storageTB(model.storageTiB),
      ]);
    }
  }

  addTable(ws, headers, rows.length ? rows : [["No hardware detail in this export", "", "", "", null, null, null, null, null, null, null, null, null]], 4);
  styleBody(ws, 5);
  autoWidth(ws, 11, 34);
}

function buildHosts(wb: ExcelJS.Workbook, parsed: ParsedEnvironment) {
  const ws = wb.addWorksheet("Hosts", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = ["Cluster", "Host", "Vendor", "Model", "CPU model", "Sockets", "Cores/socket", "Cores", "RAM (GB)", "CPU used %", "RAM used %"];
  sheetTitle(ws, "Physical hosts", "Every host in the export.", headers.length);

  const rows: Cell[][] = [];
  for (const cluster of parsed.clusterDetails) {
    for (const host of cluster.hostRecords) {
      rows.push([
        cluster.name,
        host.name,
        host.vendor ?? "Unknown",
        host.model,
        host.cpuModel ?? "-",
        host.sockets,
        host.coresPerSocket,
        host.cores,
        Math.round(host.ramGiB),
        host.cpuUtilPct,
        host.memoryUtilPct,
      ]);
    }
  }

  addTable(ws, headers, rows.length ? rows : [["No host rows found", "", "", "", "", null, null, null, null, null, null]], 4);
  styleBody(ws, 5);
  autoWidth(ws, 11, 34);
}

function buildPlanSheet(wb: ExcelJS.Workbook, plan: SizingPlan) {
  const ws = wb.addWorksheet("Cluster Plan", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = ["Target cluster", "Nodes", "RF", "Node class", "pCores/node", "RAM/node (GB)", "Storage/node (TB)", "Total pCores", "Total RAM (GB)", "Total raw storage (TB)", "Covers"];
  sheetTitle(
    ws,
    "Recommended cluster plan",
    plan.blockers.length
      ? "Withheld: the parsed inputs failed validation. See the Summary sheet."
      : `${plan.totalNodes} nodes across ${plan.totalClusters} cluster(s) of ${plan.profile.label}.`,
    headers.length,
  );

  const rows: Cell[][] = plan.blockers.length
    ? [["Recommendation withheld, see Summary", null, null, "", null, null, null, null, null, null, ""]]
    : plan.targets.map((t) => [
        t.name,
        t.nodes,
        `RF${t.rf}`,
        plan.profile.label,
        t.perNode.cores,
        t.perNode.ramGiB,
        storageTB(t.perNode.storageTiB),
        t.totals.cores,
        t.totals.ramGiB,
        storageTB(t.totals.rawStorageTiB),
        t.origin.join(", "),
      ]);

  addTable(ws, headers, rows, 4);
  styleBody(ws, 5);
  autoWidth(ws, 11, 40);
}

function buildTopVms(wb: ExcelJS.Workbook, parsed: ParsedEnvironment) {
  const ws = wb.addWorksheet("Largest VMs", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = ["Cluster", "VM", "Power", "vCPU", "RAM (GB)", "Storage (TB)"];
  sheetTitle(ws, "Largest VMs", "Check these fit inside a single node's usable envelope.", headers.length);

  const rows: Cell[][] = [];
  for (const cluster of parsed.clusterDetails) {
    for (const vm of cluster.topVms) {
      rows.push([cluster.name, vm.name, vm.poweredOn ? "On" : "Off", vm.vcpu, vm.ramGiB, storageTB(vm.storageTiB)]);
    }
  }

  addTable(ws, headers, rows.length ? rows : [["No VM detail in this export", "", "", null, null, null]], 4);
  styleBody(ws, 5);
  autoWidth(ws, 11, 40);
}

/**
 * Every VM the build was sized from, with what each one contributes and whether
 * the SE kept it. This is the sheet a customer argues with, so it carries the
 * measured usage next to the allocation rather than only the totals.
 */
function buildVmSheet(wb: ExcelJS.Workbook, parsed: ParsedEnvironment, plan: SizingPlan, settings: SizerSettings) {
  const ws = wb.addWorksheet("Virtual Machines", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = [
    "Included",
    "VM",
    "Cluster",
    "Power",
    "Guest OS",
    "vCPU",
    "CPU used (cores)",
    "Statistic",
    "RAM (GB)",
    "RAM used (GB)",
    "Provisioned (TB)",
    "Consumed (TB)",
    "Edited",
  ];
  const excluded = parsed.vms.filter((vm) => settings.vmAdjustments[vm.id]?.excluded).length;
  sheetTitle(
    ws,
    "Virtual machines",
    `${parsed.vms.length} VMs in the export, ${parsed.vms.length - excluded} included in the build. CPU is sized from these rows, not from host utilization.`,
    headers.length,
  );

  // Every row reports the statistic the build actually used, not whichever one
  // the export happened to carry.
  const statistic = plan.consolidated.workload.cpu.statistic;
  const rows: Cell[][] = parsed.vms.map((raw) => {
    const adjustment = settings.vmAdjustments[raw.id];
    // Report the adjusted VM, so an edited vCPU shows the usage the build used
    // rather than the export's untouched figure.
    const vm = applyAdjustment(raw, settings.vmAdjustments) ?? raw;
    const contribution = vmCpuContribution(vm, statistic, settings.vcpuToPcoreRatio);
    const used = contribution.cores;
    const edits = [
      adjustment?.vcpu != null ? `vCPU ${raw.vcpu} to ${adjustment.vcpu}` : null,
      adjustment?.ramGiB != null ? `RAM ${Math.round(raw.ramGiB)} to ${Math.round(adjustment.ramGiB)} GB` : null,
      adjustment?.storageTiB != null
        ? `storage ${storageTB(raw.storageProvisionedTiB)} to ${storageTB(adjustment.storageTiB)} TB`
        : null,
    ].filter(Boolean);
    return [
      adjustment?.excluded ? "No" : "Yes",
      vm.name,
      vm.clusterName ?? "-",
      vm.poweredOn == null ? "unknown" : vm.poweredOn ? "On" : "Off",
      vm.os,
      vm.vcpu,
      Number(used.toFixed(2)),
      contribution.measured ? cpuStatisticLabel(statistic) : "allocated (no telemetry)",
      Math.round(vm.ramGiB),
      vm.ramUsedGiB == null ? null : Math.round(vm.ramUsedGiB),
      storageTB(vm.storageProvisionedTiB),
      storageTB(vm.storageConsumedTiB),
      edits.join("; "),
    ];
  });

  addTable(ws, headers, rows.length ? rows : [["", "No VM detail in this export", "", "", "", null, null, "", null, null, null, null, ""]], 4);
  styleBody(ws, 5);
  autoWidth(ws, 10, 40);
}

function buildAudit(wb: ExcelJS.Workbook, parsed: ParsedEnvironment) {
  const ws = wb.addWorksheet("Parsed Inputs", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const headers = ["Field", "Sheet", "Column", "Unit read", "Confidence", "How it was decided"];
  sheetTitle(ws, "Parsed inputs: validation", "Which column each number came from, and how its unit was determined.", headers.length);

  let row = addTable(
    ws,
    headers,
    parsed.audit.map((a) => [a.field, a.sheet, a.column ?? "none found", a.unit ?? "-", a.confidence, a.note]),
    4,
  );

  row += 1;
  if (parsed.plausibility.length) {
    ws.getCell(row, 1).value = "Validation failures";
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FFB3261E" } };
    row += 1;
    row = addTable(
      ws,
      ["Field", "Observed", "Expected", "Detail", "", ""],
      parsed.plausibility.map((p) => [p.field, p.observed, p.expected, p.detail, "", ""]),
      row,
    );
  }

  if (parsed.notes.length) {
    row += 1;
    ws.getCell(row, 1).value = "Notes";
    ws.getCell(row, 1).font = { bold: true, size: 11 };
    row += 1;
    for (const note of parsed.notes) {
      ws.getCell(row, 1).value = note;
      ws.getCell(row, 1).font = { size: 9 };
      row += 1;
    }
  }

  ws.getCell(row + 1, 1).value = `Sheets in file: ${parsed.sheetsFound.join(", ")}`;
  ws.getCell(row + 1, 1).font = { size: 9, italic: true, color: { argb: "FF757575" } };

  styleBody(ws, 5);
  autoWidth(ws, 12, 70);
}

export async function buildSizerWorkbookBlob(
  parsed: ParsedEnvironment,
  plan: SizingPlan,
  settings: SizerSettings,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SE Deal Workspace, Simple Sizer";
  wb.created = new Date();

  buildSummary(wb, parsed, plan, settings);
  buildClusters(wb, parsed, plan);
  buildHardware(wb, parsed);
  buildHosts(wb, parsed);
  buildPlanSheet(wb, plan);
  buildVmSheet(wb, parsed, plan, settings);
  buildTopVms(wb, parsed);
  buildAudit(wb, parsed);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function sizerWorkbookFileName(parsed: ParsedEnvironment): string {
  const base = parsed.fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "environment";
  const d = new Date();
  const stamp = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.${String(d.getFullYear()).slice(-2)}`;
  return `${base}_sizer_summary_${stamp}.xlsx`;
}
