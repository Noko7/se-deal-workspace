import { buildAllAccountsKnowledgeBase } from "@/lib/account-ai";
import { toCalendarMeeting } from "@/lib/calendar";
import { getAccountsOverview, getCalendarMeetings } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { AccountAiWorkspace, type AccountOption } from "@/components/account-ai-workspace";

export const dynamic = "force-dynamic";

export default async function AccountAiHomePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const [overview, meetings, portfolio, params] = await Promise.all([
    getAccountsOverview(),
    getCalendarMeetings(),
    buildAllAccountsKnowledgeBase(),
    searchParams,
  ]);

  const accounts: AccountOption[] = overview.map((account) => ({
    id: account.id,
    accountName: account.accountName,
    dealName: account.name,
    stage: account.stage,
    aiOptOut: account.aiOptOut,
  }));

  const calendarMeetings = meetings.map(toCalendarMeeting);

  // Deep-link: ?account=<id> preselects that account. The id may be any of the
  // account's opportunities (pipeline cards link per-deal), so resolve sibling
  // opp ids to the account's primary row instead of silently dropping them.
  let initialSelected: string | undefined;
  if (params.account) {
    if (accounts.some((a) => a.id === params.account)) {
      initialSelected = params.account;
    } else {
      const deal = await prisma.deal.findUnique({
        where: { id: params.account },
        select: { accountName: true },
      });
      initialSelected = deal
        ? accounts.find((a) => a.accountName === deal.accountName)?.id
        : undefined;
    }
  }

  return (
    <AccountAiWorkspace
      accounts={accounts}
      meetings={calendarMeetings}
      initialSelected={initialSelected}
      aggregate={{
        accountCount: portfolio.summary.accountCount,
        meetingCount: portfolio.summary.meetingCount,
        noteCount: portfolio.summary.noteCount,
        assetCount: portfolio.summary.assetCount,
      }}
    />
  );
}
