import { prisma } from "./prisma";

export {
  PRODUCT_OPTIONS,
  TASK_TYPE_OPTIONS,
  TASK_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from "./salesforce-options";

export type SalesforceTaskInput = {
  dealId?: string | null;
  meetingId?: string | null;
  taskName: string;
  description?: string | null;
  assignee?: string | null;
  relatedAccount?: string | null;
  products: string[];
  type?: string | null;
  status: string;
  dueDate?: Date | null;
  durationHrs?: number | null;
  contact?: string | null;
  priority: string;
  remind: boolean;
  createdBy?: string | null;
};

/**
 * Push a task to the live Salesforce API. Until SALESFORCE_INSTANCE_URL /
 * SALESFORCE_CLIENT_ID exist this returns "queued" so tasks persist locally and
 * sync once live credentials are wired. This is the single seam to make live.
 */
export async function pushSalesforceTask(): Promise<{
  status: "QUEUED" | "SENT" | "FAILED";
  detail: string;
  salesforceId?: string;
}> {
  if (!process.env.SALESFORCE_INSTANCE_URL || !process.env.SALESFORCE_CLIENT_ID) {
    return {
      status: "QUEUED",
      detail: "Saved locally. Salesforce is not connected yet — will sync when live credentials are configured.",
    };
  }
  // Wave 2: POST to <instance>/services/data/vXX.0/sobjects/Task with an OAuth
  // token, then return SENT with the created record id.
  return { status: "QUEUED", detail: "Salesforce connector scaffold is configured; live Task POST lands in Wave 2." };
}

export async function createSalesforceTask(input: SalesforceTaskInput) {
  const push = await pushSalesforceTask();
  return prisma.salesforceTask.create({
    data: {
      dealId: input.dealId || null,
      meetingId: input.meetingId || null,
      taskName: input.taskName,
      description: input.description?.trim() || null,
      assignee: input.assignee?.trim() || null,
      relatedAccount: input.relatedAccount?.trim() || null,
      products: JSON.stringify(input.products),
      type: input.type?.trim() || null,
      status: input.status,
      dueDate: input.dueDate ?? null,
      durationHrs: input.durationHrs ?? null,
      contact: input.contact?.trim() || null,
      priority: input.priority,
      remind: input.remind,
      syncStatus: push.status,
      syncDetail: push.detail,
      syncedAt: push.status === "SENT" ? new Date() : null,
      salesforceId: push.salesforceId ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}
