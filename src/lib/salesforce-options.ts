// Field option sets mirrored from the "Helper" Salesforce task form. Kept in a
// dependency-free module so client components (the meeting drawer form) can
// import them without pulling in Prisma.

export const PRODUCT_OPTIONS = [
  "AHV",
  "NAI",
  "NCI",
  "NCI Data",
  "NCM",
  "NDB",
  "NKP",
  "NUS",
  "NC2-AWS",
  "NC2-Azure",
  "NC2 - GCP",
  "DRaaS",
  "EUC",
] as const;

export const TASK_TYPE_OPTIONS = ["Call", "Email", "Meeting", "Demo", "Follow-up", "Other"] as const;

export const TASK_STATUS_OPTIONS = [
  "Not Started",
  "In Progress",
  "Completed",
  "Waiting on someone else",
  "Deferred",
] as const;

export const PRIORITY_OPTIONS = ["Low", "Normal", "High"] as const;
