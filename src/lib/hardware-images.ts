// Registry mapping a Nutanix node SKU to its product diagram in /public/hardware.
// Lookups are exact (case/whitespace-normalized) only -- if a SKU has no image,
// nothing is shown rather than substituting a related model.
//
// Front and rear renders come from the official Nutanix G10 product image pack.
// Platform specs (NX_PLATFORMS) are transcribed from the official Nutanix
// hardware platform specsheet (nutanix.com/products/hardware-platforms/specsheet)
// and the per-model NX-<model>-G10 spec sheets. Nothing here is estimated.

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

// Platform reference for the entire Nutanix NX line (G7 through G10). Every value
// is transcribed directly from the official Nutanix platform specsheet. The hard
// sizing numbers (cores, RAM, storage actually configured) still come from the
// sized scenario; this map adds the platform envelope so an SE can explain
// "why this box" in a review, plus the physical drive-bay count so we can show
// how many slots are left unused.
export type PlatformStatus = "current" | "endOfSale" | "outOfSupport";

export type PlatformSpec = {
  family: string; // marketing family, e.g. "NX-8000 Series"
  generation: string; // hardware generation, e.g. "G10"
  formFactor: string; // chassis form factor, e.g. "1U, 1 node"
  cpu: string; // socket count + CPU family
  coreRange: string; // available cores per CPU
  memoryRange: string; // supported memory range
  storage: string; // supported media + drive/capacity envelope
  storageTypes?: string; // supported storage configurations
  gpu?: string; // supported GPUs, when applicable
  useCases: string; // vendor-listed use cases
  maxDriveBays?: number; // physical front drive bays (for empty-slot math)
  status: PlatformStatus; // current / end-of-sale / out-of-support
};

export const NX_PLATFORMS: Record<string, PlatformSpec> = {
  "NX-1065-G8": {
    family: "NX-1000 Series",
    generation: "G8",
    formFactor: "2U, 4 nodes",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 20 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 43.68 TB (SSD+HDD, SSD+HDD SED)",
    useCases: "Remote Office/Branch Office, Test and Development, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-1065-G9": {
    family: "NX-1000 Series",
    generation: "G9",
    formFactor: "2U, 3 nodes",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 24 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 43.68 TB (SSD+HDD, SSD+HDD SED)",
    useCases: "Backup and Disaster Recovery, Remote Office/Branch Office",
    status: "current",
  },
  "NX-1065N-G8": {
    family: "NX-1000 Series",
    generation: "G8",
    formFactor: "2U, 4 nodes",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 20 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 43.68 TB (SSD+HDD, SSD+HDD SED)",
    useCases: "Remote Office/Branch Office, Test and Development, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-1120AS-G10": {
    family: "NX-1000 Series",
    generation: "G10",
    formFactor: "1U, 1 node",
    cpu: "Single AMD EPYC™ 8004 Series (Siena)",
    coreRange: "Up to 16 cores per CPU socket",
    memoryRange: "Up to 384 GB",
    storage: "Up to 15.36 TB (All NVMe)",
    useCases: "IT Apps, Remote Office/Branch Office, Server Virtualization",
    maxDriveBays: 2,
    status: "current",
  },
  "NX-1120S-G7": {
    family: "NX-1000 Series",
    generation: "G7",
    formFactor: "1U, 1 node",
    cpu: "Single Intel Skylake D",
    coreRange: "Up to 8 cores per CPU socket",
    memoryRange: "Up to 256 GB",
    storage: "Up to 15.36 TB (All SSD SED, All SSD)",
    useCases: "Remote Office/Branch Office",
    status: "current",
  },
  "NX-1150S-G9": {
    family: "NX-1000 Series",
    generation: "G9",
    formFactor: "2U, 1 node",
    cpu: "Single Intel Xeon® 5th Gen. (Emerald Rapids), Single Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 16 cores per CPU socket",
    memoryRange: "Up to 768 GB",
    storage: "Up to 30.72 TB (All NVMe SED, All NVMe)",
    useCases: "IT Apps, Remote Office/Branch Office, Server Virtualization, VDI, End-User Computing",
    status: "current",
  },
  "NX-1175S-G10": {
    family: "NX-1000 Series",
    generation: "G10",
    formFactor: "1U, 1 node",
    cpu: "Single Intel Xeon® 6 (Granite Rapids)",
    coreRange: "Up to 36 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 66.72 TB (NVMe+HDD, All NVMe SED, NVMe SED+HDD SED, All NVMe)",
    gpu: "Up to 2x NVIDIA L4 (24 GB)",
    useCases: "End-User Computing/Virtual Desktop Infrastructure, Artificial Intelligence/Machine Learning, Server Virtualization, Remote Office/Branch Office, Test and Development",
    maxDriveBays: 4,
    status: "current",
  },
  "NX-1175S-G8": {
    family: "NX-1000 Series",
    generation: "G8",
    formFactor: "1U, 1 node",
    cpu: "Single Intel Ice Lake",
    coreRange: "Up to 24 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 51.36 TB (All SSD SED, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "Remote Office/Branch Office, Test and Development, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-1175S-G9": {
    family: "NX-1000 Series",
    generation: "G9",
    formFactor: "1U, 1 node",
    cpu: "Single Intel Xeon® 5th Gen. (Emerald Rapids), Single Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 66.72 TB (NVMe+HDD, All NVMe SED, NVMe SED+HDD SED, All NVMe)",
    useCases: "Analytics and Big Data, Remote Office/Branch Office, End-User Computing/Virtual Desktop Infrastructure, Test and Development",
    status: "current",
  },
  "NX-3035-G10": {
    family: "NX-3000 Series",
    generation: "G10",
    formFactor: "2U, 2 nodes",
    cpu: "Dual Intel Xeon® 6 (Granite Rapids)",
    coreRange: "Up to 24 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 102.72 TB (NVMe+HDD, All NVMe SED, All SSD, NVMe SED+HDD SED, All NVMe)",
    useCases: "End-User Computing/Virtual Desktop Infrastructure, Rack Dense VDI, Remote Office/Branch Office",
    maxDriveBays: 6,
    status: "current",
  },
  "NX-3035-G9": {
    family: "NX-3000 Series",
    generation: "G9",
    formFactor: "2U, 2 nodes",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 28 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 87.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "IT Apps, DB, Private Cloud, Server Virtualization, Backup and Disaster Recovery, VDI",
    status: "current",
  },
  "NX-3060-G7": {
    family: "NX-3000 Series",
    generation: "G7",
    formFactor: "2U, 4 nodes",
    cpu: "Dual Intel Cascade Lake",
    coreRange: "Up to 20 cores per CPU socket",
    memoryRange: "Up to 1536 GB",
    storage: "Up to 46.09 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "Analytics and Big Data, Files and Objects, Private Cloud, End-User Computing/Virtual Desktop Infrastructure, Remote Office/Branch Office",
    status: "endOfSale",
  },
  "NX-3060-G8": {
    family: "NX-3000 Series",
    generation: "G8",
    formFactor: "2U, 4 nodes",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 24 cores per CPU socket",
    memoryRange: "Up to 1536 GB",
    storage: "Up to 46.09 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "Analytics and Big Data, Files and Objects, Private Cloud, End-User Computing/Virtual Desktop Infrastructure, Remote Office/Branch Office",
    status: "endOfSale",
  },
  "NX-3060-G9": {
    family: "NX-3000 Series",
    generation: "G9",
    formFactor: "2U, 4 nodes",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 20 cores per CPU socket",
    memoryRange: "Up to 1536 GB",
    storage: "Up to 46.08 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "DB, IT Apps, Server Virtualization, VDI, End-User Computing, Remote Office/Branch Office, Private Cloud",
    status: "current",
  },
  "NX-3060N-G8": {
    family: "NX-3000 Series",
    generation: "G8",
    formFactor: "2U, 4 nodes",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 24 cores per CPU socket",
    memoryRange: "Up to 1536 GB",
    storage: "Up to 46.09 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "Analytics and Big Data, Files and Objects, Private Cloud, End-User Computing/Virtual Desktop Infrastructure, Remote Office/Branch Office",
    status: "endOfSale",
  },
  "NX-3060S-G10": {
    family: "NX-3000 Series",
    generation: "G10",
    formFactor: "2U, 4 nodes",
    cpu: "Single Intel Xeon® 6 (Granite Rapids)",
    coreRange: "Up to 48 cores per CPU socket",
    memoryRange: "Up to 1024 GB",
    storage: "Up to 92.16 TB (All NVMe SED, All NVMe)",
    useCases: "Rack Dense VDI, Remote Office/Branch Office, End-User Computing/Virtual Desktop Infrastructure",
    maxDriveBays: 6,
    status: "current",
  },
  "NX-3155-G9": {
    family: "NX-3000 Series",
    generation: "G9",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 102.72 TB (NVMe+HDD, All NVMe SED, NVMe SED+HDD SED, All NVMe)",
    useCases: "Analytics and Big Data, End-User Computing/Virtual Desktop Infrastructure, Private Cloud, Rack Dense VDI, Server Virtualization, AI/ML",
    status: "current",
  },
  "NX-3155G-G8": {
    family: "NX-3000 Series",
    generation: "G8",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 36 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 87.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "End-User Computing/Virtual Desktop Infrastructure, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-3155GN-G8": {
    family: "NX-3000 Series",
    generation: "G8",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 36 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 87.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "End-User Computing/Virtual Desktop Infrastructure, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-3170-G8": {
    family: "NX-3000 Series",
    generation: "G8",
    formFactor: "1U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 92.17 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "Private Cloud, End-User Computing/Virtual Desktop Infrastructure, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-3170N-G8": {
    family: "NX-3000 Series",
    generation: "G8",
    formFactor: "1U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 92.17 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "Private Cloud, End-User Computing/Virtual Desktop Infrastructure, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8035-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "2U, 2 nodes",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 87.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "Database and Business Critical Apps, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8035N-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "2U, 2 nodes",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 87.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "Database and Business Critical Apps, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8150-G10": {
    family: "NX-8000 Series",
    generation: "G10",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Xeon® 6 (Granite Rapids)",
    coreRange: "Up to 64 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 307.2 TB (All NVMe SED, NVMe+NST, All NVMe)",
    useCases: "Database and Business Critical Apps, Files and Objects, IT Apps",
    maxDriveBays: 20,
    status: "current",
  },
  "NX-8150-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 40 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 215.06 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "Database and Business Critical Apps, Backup and Disaster Recovery, Analytics and Big Data, Files and Objects",
    status: "endOfSale",
  },
  "NX-8150-G9": {
    family: "NX-8000 Series",
    generation: "G9",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 40 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 307.2 TB (All NVMe SED, NVMe+NST, All NVMe)",
    useCases: "Database and Business Critical Apps, Analytics and Big Data, Files and Objects, IT Apps",
    status: "current",
  },
  "NX-8150G-G10": {
    family: "NX-8000 Series",
    generation: "G10",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Xeon® 6 (Granite Rapids)",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 122.88 TB (All NVMe SED, All NVMe)",
    gpu: "NVIDIA RTX PRO 6000 Blackwell Server Edition (96 GB) or up to 2x NVIDIA A16 (64 GB)",
    useCases: "AI/ML, Analytics and Big Data, End-User Computing/Virtual Desktop Infrastructure",
    maxDriveBays: 8,
    status: "current",
  },
  "NX-8150N-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 40 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 184.34 TB (All SSD SED, NVMe+SSD, All SSD)",
    useCases: "Database and Business Critical Apps, Backup and Disaster Recovery, Analytics and Big Data, Files and Objects",
    status: "endOfSale",
  },
  "NX-8155-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 40 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 195.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "Database and Business Critical Apps, Files and Objects, Backup and Disaster Recovery, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8155-G9": {
    family: "NX-8000 Series",
    generation: "G9",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 36 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 270.72 TB (NVMe+HDD, All NVMe SED, NVMe SED+HDD SED, All NVMe)",
    useCases: "Database and Business Critical Apps, Files and Objects, Backup and Disaster Recovery, Analytics and Big Data, Server Virtualization, Private Cloud, IT Apps",
    status: "current",
  },
  "NX-8155A-G9": {
    family: "NX-8000 Series",
    generation: "G9",
    formFactor: "2U, 1 node",
    cpu: "Dual AMD EPYC™ 9004 Series (Genoa)",
    coreRange: "Up to 84 cores per CPU socket",
    memoryRange: "Up to 3072 GB",
    storage: "Up to 184.32 TB (All SSD, All NVMe)",
    useCases: "Analytics and Big Data, Backup and Disaster Recovery, Database and Business Critical Apps, Files and Objects, End-User Computing/Virtual Desktop Infrastructure, High Performance, IT Apps, Server Virtualization, Rack Dense VDI, Private Cloud, AI/ML",
    status: "current",
  },
  "NX-8155AS-G10": {
    family: "NX-8000 Series",
    generation: "G10",
    formFactor: "2U, 1 node",
    cpu: "Single AMD EPYC™ 9005 Series (Turin)",
    coreRange: "Up to 128 cores per CPU socket",
    memoryRange: "Up to 3072 GB",
    storage: "Up to 184.32 TB (All NVMe)",
    gpu: "Up to 3x NVIDIA L4 (24 GB) or 1x NVIDIA A16 (64 GB)",
    useCases: "Rack Dense VDI, IT Apps, Database and Business Critical Apps",
    maxDriveBays: 12,
    status: "current",
  },
  "NX-8155N-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 40 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 195.36 TB (All SSD SED, NVMe+SSD, All SSD, SSD+HDD, SSD+HDD SED)",
    useCases: "Database and Business Critical Apps, Files and Objects, Backup and Disaster Recovery, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8170-G10": {
    family: "NX-8000 Series",
    generation: "G10",
    formFactor: "1U, 1 node",
    cpu: "Dual Intel Xeon® 6 (Granite Rapids)",
    coreRange: "Up to 36 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 184.32 TB (All NVMe SED, All SSD, NVMe+NST, All NVMe)",
    useCases: "Analytics and Big Data, Database and Business Critical Apps, Files and Objects, IT Apps, Private Cloud/Enterprise Cloud, Server Virtualization",
    maxDriveBays: 12,
    status: "current",
  },
  "NX-8170-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "1U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 153.6 TB (NVMe with Intel Optane, All NVMe)",
    useCases: "Database and Business Critical Apps, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8170-G9": {
    family: "NX-8000 Series",
    generation: "G9",
    formFactor: "1U, 1 node",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 184.32 TB (All SSD SED, All NVMe SED, All SSD, NVMe+NST, All NVMe)",
    useCases: "Database and Business Critical Apps, Analytics and Big Data, End-User Computing/Virtual Desktop Infrastructure, Private Cloud, Server Virtualization, IT Apps, Files and Objects",
    status: "current",
  },
  "NX-8170A-G10": {
    family: "NX-8000 Series",
    generation: "G10",
    formFactor: "1U, 1 node",
    cpu: "Dual AMD EPYC™ 9005 Series (Turin)",
    coreRange: "Up to 64 cores per CPU socket",
    memoryRange: "Up to 3072 GB",
    storage: "Up to 184.32 TB (All NVMe)",
    useCases: "Server Virtualization, Private Cloud/Enterprise Cloud, IT Apps, Database and Business Critical Apps, End-User Computing/Virtual Desktop Infrastructure",
    maxDriveBays: 12,
    status: "current",
  },
  "NX-8170N-G8": {
    family: "NX-8000 Series",
    generation: "G8",
    formFactor: "1U, 1 node",
    cpu: "Dual Intel Ice Lake",
    coreRange: "Up to 32 cores per CPU socket",
    memoryRange: "Up to 2048 GB",
    storage: "Up to 153.6 TB (NVMe with Intel Optane, All NVMe)",
    useCases: "Database and Business Critical Apps, Analytics and Big Data",
    status: "endOfSale",
  },
  "NX-8173AS-G10": {
    family: "NX-8000 Series",
    generation: "G10",
    formFactor: "1U, 1 node",
    cpu: "Single AMD EPYC™ 9005 Series (Turin)",
    coreRange: "Up to 64 cores per CPU socket",
    memoryRange: "Up to 3072 GB",
    storage: "Up to 245.76 TB (All NVMe)",
    useCases: "Private Cloud, IT Apps, Database and Business Critical Apps, Files and Objects",
    status: "current",
  },
  "NX-9151-G9": {
    family: "NX-9000 Series",
    generation: "G9",
    formFactor: "2U, 1 node",
    cpu: "Dual Intel Xeon® 5th Gen. (Emerald Rapids), Dual Intel Xeon® 4th Gen. (Sapphire Rapids)",
    coreRange: "Up to 56 cores per CPU socket",
    memoryRange: "Up to 4096 GB",
    storage: "Up to 122.88 TB (All NVMe)",
    useCases: "AI/ML, Analytics and Big Data",
    status: "current",
  },
};

// Every NX node model we recognize, derived from the platform catalog. Used to
// validate/align SKUs even when no product diagram exists for a model yet.
export const KNOWN_NODE_MODELS: string[] = Object.keys(NX_PLATFORMS).sort();

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
  return NX_PLATFORMS[norm(sku)] ?? null;
}

/** True when the SKU is a recognized Nutanix NX node model. */
export function isKnownNodeModel(sku: string): boolean {
  return norm(sku) in NX_PLATFORMS;
}

/** Total drives populated in one node of this configuration. */
export function drivesPerNode(drives: { perNode: number }[]): number {
  return drives.reduce((sum, d) => sum + (d.perNode || 0), 0);
}

/**
 * Empty (unused) front drive bays for one node: the platform's physical bay
 * count minus the drives populated in the sized config. Returns null when the
 * platform's bay count isn't known (so we never fabricate a slot number).
 */
export function emptyDriveSlots(sku: string, drives: { perNode: number }[]): number | null {
  const spec = platformSpecFor(sku);
  if (!spec?.maxDriveBays) return null;
  const used = drivesPerNode(drives);
  return Math.max(0, spec.maxDriveBays - used);
}
