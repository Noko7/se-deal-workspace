import { assignEmailAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { shortDateTime } from "@/lib/format";
import { Card, StatusPill } from "@/components/ui";

export default async function EmailMemoryPage() {
  const { deals, unassignedEmails } = await getDashboardData();

  return (
    <div className="space-y-6">
      <Card
        title="Email Memory"
        subtitle="Assign inbox items to deals so extracted context enriches long-term deal memory."
      >
        <div className="space-y-4">
          {unassignedEmails.length === 0 ? (
            <p className="text-sm text-slate-500">No unassigned emails in the queue.</p>
          ) : null}
          {unassignedEmails.map((email) => (
            <article key={email.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{email.subject}</h3>
                  <p className="text-xs text-slate-500">
                    From: {email.from} · {shortDateTime(email.receivedAt)}
                  </p>
                </div>
                <StatusPill tone="warning">Needs Assignment</StatusPill>
              </div>
              <p className="mt-3 text-sm text-slate-700">{email.body}</p>
              <form action={assignEmailAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="emailId" value={email.id} />
                <div className="space-y-1">
                  <label htmlFor={`deal-${email.id}`}>Attach To Deal</label>
                  <select id={`deal-${email.id}`} name="dealId">
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit">Assign Email</button>
              </form>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
