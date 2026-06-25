// Registry mapping a Nutanix node SKU to its product diagram in /public/hardware.
// Lookups are exact (case/whitespace-normalized) only -- if a SKU has no image,
// nothing is shown rather than substituting a related model.
//
// Front and rear renders from the official Nutanix G10 product image pack.

export const HARDWARE_IMAGES: Record<string, string> = {
  "NX-1175S-G10": "/hardware/nx-1175s-g10-front.png",
  "NX-3035-G10": "/hardware/nx-3035-g10-front.png",
  "NX-3060S-G10": "/hardware/nx-3060s-g10-front.png",
  "NX-8150-G10": "/hardware/nx-8150-g10-front.png",
  "NX-8155AS-G10": "/hardware/nx-8155as-g10-front.png",
  "NX-8170-G10": "/hardware/nx-8170-g10-front.png",
  "NX-8170A-G10": "/hardware/nx-8170a-g10-front.png",
};

export const HARDWARE_IMAGES_REAR: Record<string, string> = {
  "NX-1175S-G10": "/hardware/nx-1175s-g10-rear.png",
  "NX-3035-G10": "/hardware/nx-3035-g10-rear.png",
  "NX-3060S-G10": "/hardware/nx-3060s-g10-rear.png",
  "NX-8150-G10": "/hardware/nx-8150-g10-rear.png",
  "NX-8155AS-G10": "/hardware/nx-8155as-g10-rear.png",
  "NX-8170-G10": "/hardware/nx-8170-g10-rear.png",
  "NX-8170A-G10": "/hardware/nx-8170a-g10-rear.png",
};

// Authoritative G10 node models, taken from the official Nutanix Visio stencil
// (NTNX-stencil_G10). Used to recognize and align SKUs even when we have no
// diagram for them yet.
export const KNOWN_NODE_MODELS: string[] = [
  "NX-1120AS-G10",
  "NX-1175S-G10",
  "NX-3035-G10",
  "NX-3060S-G10",
  "NX-8150-G10",
  "NX-8150G-G10",
  "NX-8155AS-G10",
  "NX-8170-G10",
  "NX-8170A-G10",
];

// Platform reference for the NX G10 line. Every value below is transcribed
// directly from the official Nutanix NX-<model>-G10 specification sheets
// (Nutanix, 2024). Nothing here is estimated. The hard sizing numbers (cores,
// RAM, storage actually configured) still come from the sized scenario; this map
// adds the platform envelope so an SE can explain "why this box" in a review.
export type PlatformSpec = {
  family: string; // marketing family, e.g. "NX-8170 Series"
  formFactor: string; // chassis form factor, e.g. "1U, 1 node"
  cpu: string; // socket count + CPU family
  coreRange: string; // available cores per CPU
  memoryRange: string; // supported memory range
  storage: string; // supported media + drive/capacity envelope
  gpu: string; // supported GPUs, or "N/A"
  useCases: string; // vendor-listed use cases
};

export const G10_PLATFORMS: Record<string, PlatformSpec> = {
  "NX-1120AS-G10": {
    family: "NX-1000 Series",
    formFactor: "1U, 1 node",
    cpu: "Single-socket AMD EPYC 8004 Series (Siena)",
    coreRange: "8 to 16 cores per CPU",
    memoryRange: "64 GB to 384 GB",
    storage: "All-NVMe, up to 2 drives (1.92 TB to 7.68 TB)",
    gpu: "N/A",
    useCases: "IT apps, remote/branch office, server virtualization",
  },
  "NX-1175S-G10": {
    family: "NX-1175S Series",
    formFactor: "1U, 1 node",
    cpu: "Single-socket Intel Xeon 6 (Granite Rapids)",
    coreRange: "8 to 36 cores per CPU",
    memoryRange: "128 GB to 1024 GB",
    storage: "All-NVMe (incl. SED) or NVMe+HDD hybrid, up to 4 drives (3.84 TB to 18 TB)",
    gpu: "Up to 2x NVIDIA L4 (24 GB)",
    useCases: "EUC/VDI, AI/ML, server virtualization, remote/branch office, test and development",
  },
  "NX-3035-G10": {
    family: "NX-3000 Series",
    formFactor: "2U, 2 nodes",
    cpu: "Dual-socket Intel Xeon 6 (Granite Rapids) per node",
    coreRange: "8 to 24 cores per CPU",
    memoryRange: "512 GB to 2048 GB",
    storage: "All-NVMe (incl. SED), All-SSD, or NVMe+HDD, up to 6 drives (3.84 TB to 18 TB)",
    gpu: "N/A",
    useCases: "EUC/VDI, rack-dense VDI, remote/branch office",
  },
  "NX-3060S-G10": {
    family: "NX-3000 Series",
    formFactor: "2U, 4 nodes",
    cpu: "Single-socket Intel Xeon 6 (Granite Rapids) per node",
    coreRange: "16 to 48 cores per CPU",
    memoryRange: "256 GB to 1024 GB",
    storage: "All-NVMe (incl. SED), up to 6 drives (3.84 TB to 15.36 TB)",
    gpu: "N/A",
    useCases: "Rack-dense VDI, remote/branch office, EUC/VDI",
  },
  "NX-8150-G10": {
    family: "NX-8150 Series",
    formFactor: "2U, 1 node",
    cpu: "Dual-socket Intel Xeon 6 (Granite Rapids)",
    coreRange: "16 to 64 cores per CPU",
    memoryRange: "512 GB to 4096 GB",
    storage: "All-NVMe (incl. SED) or NVMe + Storage Tier, up to 20 drives (3.84 TB to 60 TB)",
    gpu: "N/A",
    useCases: "Databases and business-critical apps, files and objects, IT apps",
  },
  "NX-8150G-G10": {
    family: "NX-8150 Series",
    formFactor: "2U, 1 node",
    cpu: "Dual-socket Intel Xeon 6 (Granite Rapids)",
    coreRange: "8 to 32 cores per CPU",
    memoryRange: "256 GB to 4096 GB",
    storage: "All-NVMe (incl. SED), up to 8 drives (3.84 TB to 15.36 TB)",
    gpu: "NVIDIA RTX PRO 6000 Blackwell Server Edition (96 GB) or up to 2x NVIDIA A16 (64 GB)",
    useCases: "AI/ML, analytics and big data, EUC/VDI",
  },
  "NX-8155AS-G10": {
    family: "NX-8155 Series",
    formFactor: "2U, 1 node",
    cpu: "Single-socket AMD EPYC 9005 Series (Turin)",
    coreRange: "16 to 128 cores per CPU",
    memoryRange: "128 GB to 3072 GB",
    storage: "All-NVMe, up to 12 drives (3.84 TB to 15.36 TB)",
    gpu: "Up to 3x NVIDIA L4 (24 GB) or 1x NVIDIA A16 (64 GB)",
    useCases: "Rack-dense VDI, IT apps, databases and business-critical apps",
  },
  "NX-8170-G10": {
    family: "NX-8170 Series",
    formFactor: "1U, 1 node",
    cpu: "Dual-socket Intel Xeon 6 (Granite Rapids)",
    coreRange: "8 to 36 cores per CPU",
    memoryRange: "256 GB to 4096 GB",
    storage: "All-NVMe (incl. SED), All-SSD, or NVMe + Storage Tier, up to 12 drives (3.84 TB to 60 TB)",
    gpu: "N/A",
    useCases: "Analytics and big data, databases and business-critical apps, files and objects, IT apps, private cloud, server virtualization",
  },
  "NX-8170A-G10": {
    family: "NX-8170 Series",
    formFactor: "1U, 1 node",
    cpu: "Dual-socket AMD EPYC 9005 Series (Turin)",
    coreRange: "16 to 64 cores per CPU",
    memoryRange: "128 GB to 3072 GB",
    storage: "All-NVMe, up to 12 drives (3.84 TB to 15.36 TB)",
    gpu: "N/A",
    useCases: "Server virtualization, private cloud, IT apps, databases and business-critical apps, EUC/VDI",
  },
};

const norm = (s: string) => s.trim().toUpperCase();

// Exact match only. If there's no image for the SKU, there's no image -- we never
// substitute a different model's render.
export function hardwareImageFor(sku: string): string | null {
  return HARDWARE_IMAGES[norm(sku)] ?? null;
}

export function hardwareRearImageFor(sku: string): string | null {
  return HARDWARE_IMAGES_REAR[norm(sku)] ?? null;
}

/** Curated platform reference for a SKU. Exact match only. */
export function platformSpecFor(sku: string): PlatformSpec | null {
  return G10_PLATFORMS[norm(sku)] ?? null;
}
