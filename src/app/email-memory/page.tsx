import { assignEmailAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { shortDateTime } from "@/lib/format";
import { ActionBar, Button, Card, EmptyState, FormRow, SectionHeader, StatusPill } from "@/components/ui";

export default async function EmailMemoryPage() {
  const { deals, unassignedEmails } = await getDashboardData();

  return (
    <div className="space-y-6">
      <Card title="Email Memory" subtitle="Assign inbox items to deals so extracted context enriches long-term deal memory.">
        <SectionHeader
          title="Unassigned Inbox Queue"
          subtitle="Review inbound customer context and link each message to the correct deal."
        />
        <div className="space-y-4">
          {unassignedEmails.length === 0 ? (
            <EmptyState
              title="Queue is clear"
              description="No unassigned emails right now. New emails will appear here for deal linking."
            />
          ) : null}
          {unassignedEmails.map((email) => (
            <article key={email.id} className="rounded-lg border border-charcoal-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{email.subject}</h3>
                  <p className="text-xs text-charcoal-500">
                    From: {email.from} · {shortDateTime(email.receivedAt)}
                  </p>
                </div>
                <StatusPill tone="warning">Needs Assignment</StatusPill>
              </div>
              <p className="mt-3 text-sm text-charcoal-700">{email.body}</p>
              <form action={assignEmailAction} className="mt-3 rounded-md border border-charcoal-200 p-3">
                <input type="hidden" name="emailId" value={email.id} />
                <FormRow
                  label="Attach to Deal"
                  htmlFor={`deal-${email.id}`}
                  helper="Assigning this email updates deal memory and context extraction."
                >
                  <select id={`deal-${email.id}`} name="dealId">
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <ActionBar>
                  <Button type="submit">Assign Email</Button>
                </ActionBar>
              </form>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
