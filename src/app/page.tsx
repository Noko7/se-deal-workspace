import { cookies } from "next/headers";
import { buildAllAccountsKnowledgeBase } from "@/lib/account-ai";
import { toCalendarMeeting } from "@/lib/calendar";
import { getAccountsOverview, getDashboardData, resolveSeOwner } from "@/lib/data";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { AccountAiWorkspace, type AccountOption } from "@/components/account-ai-workspace";

export const dynamic = "force-dynamic";

export default async function AccountAiHomePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const [overview, { meetings }, portfolio, store, params] = await Promise.all([
    getAccountsOverview(),
    getDashboardData(),
    buildAllAccountsKnowledgeBase(),
    cookies(),
    searchParams,
  ]);

  // Single-SE workspace: every account belongs to the logged-in SE.
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const se =
    session?.name?.trim() || resolveSeOwner(overview.map((account) => account.owner), null) || "Me";

  const accounts: AccountOption[] = overview.map((account) => ({
    id: account.id,
    accountName: account.accountName,
    dealName: account.name,
    stage: account.stage,
    owner: se,
    nextAction: account.nextAction,
    latestSignal: account.latestSignal,
    aiOptOut: account.aiOptOut,
  }));

  const calendarMeetings = meetings.map(toCalendarMeeting);

  // Deep-link from My Accounts: ?account=<id> preselects that account.
  const initialSelected = params.account && accounts.some((a) => a.id === params.account) ? params.account : undefined;

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
