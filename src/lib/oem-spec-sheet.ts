// Partner (OEM) HCI platforms, transcribed verbatim from the Nutanix hardware
// platform spec sheet (nutanix.com/products/hardware-platforms/specsheet, data
// as of Oct 2026, saved as HWSpecs.html). Only the fields the sizer uses are
// kept: name, form factor, CPU ("Server Compute"), max cores per socket
// ("Processor Power"), storage types, max storage (TB), max memory (GB) and the
// listed use cases.
//
// Kept: on-premises partners with current platforms (Dell, HPE, Cisco, Lenovo,
// Fsas Tech, Fujitsu), rows not marked end of sale.
// Left out: every row marked end of sale (e.g. Dell XC "CORE" Ice Lake/Rome
// models), Cascade Lake-era vendors (Hitachi, Inspur, Intel, NEC, KTNF),
// tactical/ruggedized appliances (Klas, PacStar, ST Engineering) and NC2 bare
// metal (AWS, Azure, Google Cloud), which is a cloud service, not a build.
//
// The sheet states maxima only (no CPU SKU list, DIMM table or drive bays), so
// oem-catalog.ts turns each row into a bounded envelope; see the notes there.

export type OemVendor = "Dell" | "HPE" | "Cisco" | "Lenovo" | "Fsas Tech" | "Fujitsu";

export const OEM_VENDORS: OemVendor[] = ["Dell", "HPE", "Cisco", "Lenovo", "Fsas Tech", "Fujitsu"];

export const OEM_VENDOR_LABEL: Record<OemVendor, string> = {
  Dell: "Dell XC",
  HPE: "HPE ProLiant DX / DL",
  Cisco: "Cisco HCI (UCS)",
  Lenovo: "Lenovo ThinkAgile HX",
  "Fsas Tech": "Fsas Tech XF (formerly Fujitsu)",
  Fujitsu: "Fujitsu XF",
};

export type OemSheetRow = {
  vendor: OemVendor;
  name: string;
  formFactor: string;
  serverCompute: string;
  coresPerSocket: number; // "Processor Power: N Cores (per CPU socket)"
  storageTypes: string;
  maxStorageTB: number;
  maxMemoryGB: number;
  latest: boolean;
  useCases: string[];
};

const row = (
  vendor: OemVendor,
  name: string,
  formFactor: string,
  serverCompute: string,
  coresPerSocket: number,
  storageTypes: string,
  maxStorageTB: number,
  maxMemoryGB: number,
  useCases: string[],
  latest = false,
): OemSheetRow => ({ vendor, name, formFactor, serverCompute, coresPerSocket, storageTypes, maxStorageTB, maxMemoryGB, latest, useCases });

// Use case strings as the sheet spells them.
const AI = "AI/ML";
const BIG = "Analytics and Big Data";
const BDR = "Backup and Disaster Recovery";
const DB = "Database and Business Critical Apps";
const EUC = "End-User Computing/Virtual Desktop Infrastructure";
const FO = "Files and Objects";
const PC = "Private Cloud";
const SV = "Server Virtualization";
const TD = "Test and Development";
const ROBO = "Remote Office/Branch Office";
const RDV = "Rack Dense VDI";
const HANA = "SAP HANA";
const HPC = "High Performance Computing";
const EC = "Enterprise cloud";

export const OEM_SHEET: OemSheetRow[] = [
  // ---- Dell ----
  row("Dell", "XC7625-24N", "2U1N", "Dual AMD EPYC 9004 Series (Genoa)", 128, "All NVMe", 307.2, 3072, [AI, BIG, DB, "DB", EUC, "High Performance", TD, "VDI"]),
  row("Dell", "XC660-10", "1U1N", "Dual Intel Xeon 5th/4th Gen.", 52, "All SSD SED, All SSD", 76.8, 4096, ["VDI", HANA, SV, PC]),
  row("Dell", "XC760-14", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 32, "All SSD SED, All SSD, SSD+HDD", 294.72, 4096, [BIG, AI, BDR, DB, FO, SV]),
  row("Dell", "XC670-16", "1U1N", "Dual Intel Xeon 6 (Granite Rapids)", 64, "All NVMe", 245.76, 8192, [EUC, EC, PC, RDV, SV]),
  row("Dell", "XC7725-16", "2U1N", "Dual AMD EPYC 9005 Series (Turin)", 160, "All NVMe", 245.76, 6144, [AI, BIG, DB, EUC, HPC, RDV, SV], true),
  row("Dell", "XC7625-24", "2U1N", "Dual AMD EPYC 9004/Bergamo", 128, "All SSD SED, NVMe+SSD, All SSD, All NVMe", 276.48, 2304, [AI, BIG, DB, "High Performance", SV]),
  row("Dell", "XC6715-16", "1U1N", "Single AMD EPYC 9005 Series (Turin)", 160, "All NVMe", 245.76, 6144, ["DB", EUC, PC, RDV, ROBO, SV]),
  row("Dell", "XC660-12N", "1U1N", "Dual Intel Xeon 5th/4th Gen.", 32, "All NVMe", 184.32, 4096, [EUC, FO, "High Performance", PC, RDV, SV]),
  row("Dell", "XC660xs-4s", "1U1N", "Single Intel Xeon 5th/4th Gen.", 32, "All SSD, SSD+HDD", 59.36, 1024, [EUC, ROBO]),
  row("Dell", "XC770-16", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All NVMe", 245.76, 4096, [AI, BIG, DB, EUC, EC, "IT Apps", PC, RDV]),
  row("Dell", "XC670-16S", "1U1N", "Single Intel Xeon 6 (Granite Rapids)", 64, "All NVMe", 245.76, 4096, [DB, EUC, EC, "IT Apps", PC, RDV]),
  row("Dell", "XC760xa-6N", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All NVMe", 92.16, 4096, [AI, BIG, "Tactical and Ruggedized"]),
  row("Dell", "XC760-24", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All SSD SED, All SSD", 184.32, 4096, [AI, BIG, DB, EC, PC, SV, HANA]),
  row("Dell", "XC4000", "1U1N", "Single Intel Ice Lake", 20, "All NVMe", 15.36, 512, ["Tactical and Ruggedized", ROBO]),
  row("Dell", "XC760-24N", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All NVMe", 307.2, 4096, [BIG, DB, EUC, EC, FO, "High Performance"]),
  row("Dell", "XC660xs-4", "1U1N", "Dual Intel Xeon 5th/4th Gen.", 32, "All SSD, SSD+HDD", 59.36, 4096, [ROBO]),

  // ---- HPE ----
  row("HPE", "ProLiant DX4120 Gen11 24LFF", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "NVMe+HDD", 572.16, 6144, [FO]),
  row("HPE", "ProLiant DX380 Gen11 12LFF", "2U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "SSD+HDD", 301.44, 4096, [BIG, BDR, FO, PC, TD]),
  row("HPE", "ProLiant DX560 AC Gen11 16NVMe", "2U1N", "Quad Intel Xeon 4th Gen.", 32, "All NVMe", 245.76, 8192, [DB, "Epic", HPC, HANA, SV]),
  row("HPE", "ProLiant DX380 Gen11 24NVMe", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All NVMe", 307.2, 4096, [BIG, DB, EUC, PC, HANA, TD]),
  row("HPE", "ProLiant DX360 Gen11 10NVMe", "1U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "All NVMe", 153.6, 4096, [DB, EUC, HPC]),
  row("HPE", "DL380 12LFF G12", "2U1N", "Single or Dual Intel Xeon 6 (Granite Rapids)", 86, "SSD+HDD", 270.72, 4096, [BIG, BDR, FO, PC, TD]),
  row("HPE", "ProLiant DX380 Gen11 24SFF", "2U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "All SSD", 368.64, 4096, [BIG, DB, PC, HANA, TD]),
  row("HPE", "ProLiant DX385 Gen11 12LFF", "2U1N", "Single or Dual AMD EPYC 9004/9005", 160, "All SSD, SSD+HDD", 301.44, 6144, [BIG, BDR, FO, PC, TD]),
  row("HPE", "ProLiant DX560 LC Gen11 16NVMe", "2U1N", "Quad Intel Xeon 4th Gen.", 60, "All NVMe", 245.76, 8192, [DB, "Epic", HANA, SV]),
  row("HPE", "DL145 6EDSFF G11", "2U1N", "Single AMD EPYC 8004 Series (Siena)", 64, "All NVMe", 46.08, 768, [AI, EUC, ROBO, TD], true),
  row("HPE", "ProLiant DX385 Gen11 NVMe", "2U1N", "Dual AMD EPYC 9004/9005", 160, "All NVMe", 307.2, 6144, [BIG, BDR, FO, PC, TD]),
  row("HPE", "DL380 24NVMe G12", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All NVMe", 307.2, 4096, [BIG, DB, PC, HANA, TD]),
  row("HPE", "ProLiant DX360 Gen11 8SFF", "1U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "NVMe+SSD, All SSD", 153.6, 4096, [BIG, EUC]),
  row("HPE", "ProLiant DX365 Gen11 10NVMe", "1U1N", "Dual AMD EPYC 9004/9005", 160, "All NVMe", 153.6, 6144, [DB, EUC, HPC]),
  row("HPE", "ProLiant DX380a Gen11 4DW", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All NVMe", 122.88, 3072, [AI, "Artificial Intelligence/Machine Learning"]),
  row("HPE", "ProLiant DX320 Gen11 4LFF", "1U1N", "Single Intel Xeon 5th/4th Gen.", 60, "All SSD, SSD+HDD", 70.72, 2048, [ROBO]),
  row("HPE", "ProLiant DX385 Gen11 GPU 8SFF", "2U1N", "Dual AMD EPYC 9004/9005", 160, "All NVMe", 122.88, 3072, [AI, "Artificial Intelligence/Machine Learning", EUC]),
  row("HPE", "DL360 10NVMe/20EDSFF G12", "1U1N", "Single or Dual Intel Xeon 6 (Granite Rapids)", 86, "All NVMe", 307.2, 4096, [DB, EUC, HPC]),

  // ---- Cisco ----
  row("Cisco", "HCIX210C-M7SN/UCSX-210C-M7", "Modular System", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "All NVMe", 91.8, 8192, [AI, BIG, BDR, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCIAF220C-M7SN/UCSC-C220-M7N", "1U1N", "Dual Intel Xeon 5th/4th Gen.", 52, "All NVMe", 153, 4096, [BIG, BDR, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCIAF220C-M7S/UCSC-C220-M7S", "1U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 60, "All SSD SED, All SSD", 153, 4096, [BIG, BDR, DB, EUC, PC, SV]),
  row("Cisco", "HCINX240C-M8SX", "2U1N", "Single or Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All SSD", 367.2, 8192, [BIG, BDR, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCINX220C-M8S", "1U1N", "Single or Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All SSD", 153, 8192, [BIG, BDR, DB, EUC, "IT Apps", PC, SV]),
  row("Cisco", "HCIXNX215C-M8SN", "Modular System", "Single or Dual AMD EPYC 9005 Series (Turin)", 160, "All NVMe", 122.4, 3072, [BIG, BDR, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCINX240C-M8E3S", "2U1N", "Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All NVMe", 367.2, 8192, [AI, BIG, BDR, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCIAF240C-M7SN/UCSC-C240-M7SN", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All NVMe", 367.2, 8192, [AI, BIG, BDR, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCIAF240C-M6SX/UCSC-C240-M6SX", "2U1N", "Single or Dual Intel Ice Lake", 40, "All SSD SED, All SSD", 182.4, 8192, [BIG, BDR, DB, EUC, PC, SV]),
  row("Cisco", "HCINX240C-M8L", "2U1N", "Single or Dual Intel Xeon 6 (Granite Rapids)", 86, "SSD+HDD", 445.2, 8192, [BIG, BDR, DB, FO, PC, SV]),
  row("Cisco", "HCIAF220C-M6S/UCSC-C220-M6S", "1U1N", "Single or Dual Intel Ice Lake", 40, "All SSD SED, All SSD", 76, 4096, [BIG, BDR, DB, EUC, PC, SV]),
  row("Cisco", "HCINX220C-M8E3S", "1U1N", "Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All NVMe", 244.8, 8192, [BIG, BDR, DB, EUC, PC, SV]),
  row("Cisco", "HCIXNX210C-M8SN", "Modular System", "Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All NVMe", 137.7, 4096, [BIG, BDR, DB, EUC, PC, SV]),
  row("Cisco", "HCIAF220C-M6SN/UCSC-C220-M6N", "1U1N", "Single or Dual Intel Ice Lake", 40, "All NVMe", 153, 4096, [BIG, BDR, DB, EUC, PC, SV]),
  row("Cisco", "HCIAF240C-M7SX/UCSC-C240-M7SX", "2U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "All SSD SED, All SSD", 367.2, 8192, [AI, BIG, DB, EUC, FO, PC, SV]),
  row("Cisco", "HCIXENX130C-M8-20", "1U1N", "Single Intel Xeon 6 (Granite Rapids-D)", 20, "All NVMe", 61.2, 768, ["AI at the edge", BDR, "Edge Compute", EUC, FO, PC, ROBO], true),
  row("Cisco", "HCINX225C-M8SN", "1U1N", "Single AMD EPYC 9005 Series (Turin)", 96, "All NVMe", 153, 3072, [AI, BIG, DB, EUC, PC, SV]),

  // ---- Lenovo ----
  row("Lenovo", "HX630 V4 - 10NVMe", "1U1N", "Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All NVMe", 153.6, 8192, [AI, BIG, BDR, DB, EUC, FO, PC, RDV, TD]),
  row("Lenovo", "HX650 V4 - 24NVMe", "2U1N", "Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All NVMe", 368.64, 8192, [AI, BIG, DB, FO, "High Performance", PC, SV, TD]),
  row("Lenovo", "HX645 V3 IS - 10NVMe", "1U1N", "Dual AMD EPYC 9004/9005", 128, "All NVMe", 153.6, 6144, [BIG, BDR, FO, PC, TD]),
  row("Lenovo", "HX650 V3 CN - 24NVMe", "2U1N", "Dual Intel Xeon 5th Gen.", 64, "All NVMe", 368.64, 4096, [AI, BIG, BDR, FO, PC, TD]),
  row("Lenovo", "HX650 V3 IS", "2U1N", "Dual Intel Xeon 5th Gen.", 64, "NVMe+SSD, All SSD, All NVMe", 245.76, 4096, [AI, BIG, BDR, DB, EUC, FO, PC, TD]),
  row("Lenovo", "HX650 V3 CN", "2U1N", "Dual Intel Xeon 5th Gen.", 64, "NVMe+SSD, All SSD, All NVMe", 245.76, 4096, [AI, BIG, BDR, DB, EUC, FO, PC, TD]),
  row("Lenovo", "HX665 V3 IS", "2U1N", "None or Dual AMD Genoa", 96, "All SSD", 122.88, 1536, [BIG, DB, EUC, PC]),
  row("Lenovo", "HX665 V3 CN", "2U1N", "None or Dual AMD Genoa", 96, "All SSD", 122.88, 1536, [BIG, DB, EUC, PC]),
  row("Lenovo", "HX630 V3 ROBO IS", "1U1N", "Single or Dual Intel Xeon 5th Gen.", 60, "All SSD, SSD+HDD", 63.36, 2048, [BIG, BDR, FO, PC, SV, TD]),
  row("Lenovo", "HX630 V3 ROBO CN", "1U1N", "Single or Dual Intel Xeon 5th Gen.", 60, "All SSD, SSD+HDD", 63.36, 2048, [BIG, BDR, FO, PC, SV, TD]),
  row("Lenovo", "HX650 V4 Storage", "1U1N", "Single or Dual Intel Xeon 6th Gen.", 86, "NVMe+HDD", 349.44, 8192, [AI, BIG, BDR, DB, FO, PC, TD]),
  row("Lenovo", "HX645 V3 IS", "1U1N", "None or Dual AMD Genoa", 96, "NVMe+SSD, All SSD, All NVMe", 107.52, 1536, [DB, EUC, PC, SV]),
  row("Lenovo", "HX645 V3 CN", "1U1N", "None or Dual AMD Genoa", 96, "NVMe+SSD, All SSD, All NVMe", 107.52, 1536, [DB, EUC, PC, SV]),
  row("Lenovo", "HX630 V3 CN", "1U1N", "Dual Intel Xeon 5th Gen.", 36, "NVMe+SSD, All SSD, All NVMe", 138.24, 4096, [AI, BIG, BDR, DB, EUC, FO, PC, SV, TD]),
  row("Lenovo", "HX665 V3 CN - 24NVMe", "2U1N", "Dual AMD EPYC 9004/9005", 128, "All NVMe", 307.2, 6144, [AI, BIG, BDR, FO, PC, TD]),
  row("Lenovo", "HX630 V3 IS", "1U1N", "Dual Intel Xeon 5th Gen.", 36, "NVMe+SSD, All SSD, All NVMe", 138.24, 4096, [AI, BIG, BDR, DB, EUC, FO, PC, SV, TD]),
  row("Lenovo", "HX645 V3 CN - 10NVMe", "1U1N", "Dual AMD EPYC 9004/9005", 128, "All NVMe", 153.6, 6144, [BIG, BDR, FO, PC, TD]),
  row("Lenovo", "HX650 V3 IS - 24NVMe", "2U1N", "Dual Intel Xeon 5th Gen.", 64, "All NVMe", 368.64, 4096, [AI, BIG, BDR, FO, PC, TD]),
  row("Lenovo", "HX650 V3 Storage CN", "2U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "All SSD, SSD+HDD", 270.72, 4096, [BIG, BDR, FO, PC, SV, TD]),
  row("Lenovo", "HX650a V4", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All NVMe", 122.88, 8192, [AI, BIG, BDR, EUC, FO, PC, TD]),
  row("Lenovo", "HX630 V4 - 16NVMe", "1U1N", "Dual Intel Xeon 6th Gen. (Granite Rapids)", 86, "All NVMe", 245.76, 8192, [AI, BIG, BDR, DB, EUC, FO, PC, RDV, SV, TD]),
  row("Lenovo", "HX650 V3 Storage IS", "2U1N", "Single or Dual Intel Xeon 4th/5th Gen.", 64, "All SSD, SSD+HDD", 270.72, 4096, [BIG, BDR, FO, PC, SV, TD]),
  row("Lenovo", "HX665 V3 Storage IS", "2U1N", "None or Single or Dual AMD Genoa", 96, "All SSD, SSD+HDD", 190.72, 1536, [PC, SV, TD]),
  row("Lenovo", "ThinkAgile HX360 V2 Edge", "2U1N", "None or Single Intel Ice Lake", 16, "All NVMe", 15.36, 256, [ROBO]),
  row("Lenovo", "HX665 V3 Storage CN", "2U1N", "None or Single or Dual AMD Genoa", 96, "All SSD, SSD+HDD", 190.72, 1536, [PC, SV, TD]),

  // ---- Fsas Tech (formerly Fujitsu) ----
  row("Fsas Tech", "XF8055 M8", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All SSD, SSD+HDD", 46.08, 8192, [BIG, BDR, DB, FO, PC, TD, EUC], true),
  row("Fsas Tech", "XF8050 NVMe M8", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All NVMe", 368.64, 8192, [BIG, BDR, DB, EUC, FO, PC, TD]),
  row("Fsas Tech", "XF8050 GPU M8", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All SSD, SSD+HDD", 122.88, 8192, [BIG, EUC, PC, TD], true),
  row("Fsas Tech", "XF3070 NVMe M8", "1U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All NVMe", 153.6, 8192, [BIG, DB, EUC, PC, TD], true),
  row("Fsas Tech", "XF8050A M2", "2U1N", "Dual AMD EPYC 9005 Series (Turin)", 96, "All NVMe", 368.64, 3072, [BIG, DB, EUC, PC, TD], true),
  row("Fsas Tech", "XF1070 M8", "1U1N", "Single Intel Xeon 6 (Granite Rapids)", 86, "All SSD, SSD+HDD", 47.68, 4096, [ROBO], true),
  row("Fsas Tech", "XF3070 M8", "1U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All SSD, SSD+HDD", 76.8, 8192, [EUC, PC, TD]),
  row("Fsas Tech", "XF8050 M8", "2U1N", "Dual Intel Xeon 6 (Granite Rapids)", 86, "All SSD, SSD+HDD", 184.32, 8192, [BIG, DB, EUC, PC, TD]),
  row("Fsas Tech", "XF3070A M2", "1U1N", "Single AMD EPYC 9005 Series (Turin)", 96, "All NVMe", 153.6, 3072, [BIG, DB, PC, EUC, TD], true),

  // ---- Fujitsu ----
  row("Fujitsu", "XF8055 VDI M3-Core", "2U1N", "Dual Intel Ice Lake", 36, "All SSD, SSD+HDD", 63.36, 2048, [BIG, EUC, PC, TD]),
  row("Fujitsu", "XF1070 M3", "1U1N", "Single Intel Ice Lake", 20, "All SSD, SSD+HDD", 39.36, 1024, [ROBO]),
  row("Fujitsu", "XF3070 M3-Core", "1U1N", "Dual Intel Ice Lake", 40, "All SSD, SSD+HDD", 76.8, 4096, [EUC, PC, SV, TD]),
  row("Fujitsu", "XF3070 NVMe M7", "1U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All NVMe", 153.6, 8192, [DB, EUC, PC, SV]),
  row("Fujitsu", "XF1070 M7", "1U1N", "Single Intel Xeon 5th/4th Gen.", 64, "All SSD, SSD+HDD", 66.72, 4096, [PC, SV, TD]),
  row("Fujitsu", "XF8050 NVMe M3", "2U1N", "Dual Intel Ice Lake", 40, "NVMe+SSD", 184.32, 4096, [BIG, DB, EUC, PC, SV, TD]),
  row("Fujitsu", "XF3070 M7", "1U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All SSD, SSD+HDD", 153.6, 8192, [DB, EUC, PC, SV]),
  row("Fujitsu", "XF8050 M3-Core", "2U1N", "Dual Intel Ice Lake", 40, "All SSD, SSD+HDD", 122.88, 4096, [BIG, DB, EUC, PC, SV, TD]),
  row("Fujitsu", "XF8055 M7", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All SSD, SSD+HDD", 261.44, 8192, [PC, SV, TD]),
  row("Fujitsu", "XF8055 M3", "2U1N", "Dual Intel Ice Lake", 40, "All SSD, SSD+HDD", 126.72, 2048, [BIG, BDR, DB, EUC, FO, PC, SV, TD]),
  row("Fujitsu", "XF8055 VDI M7", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All SSD, SSD+HDD", 110.72, 8192, [PC, SV, TD]),
  row("Fujitsu", "XF8050 M7", "2U1N", "Dual Intel Xeon 5th/4th Gen.", 64, "All SSD, SSD+HDD", 368.64, 8192, [BIG, DB, EUC, PC]),
];
