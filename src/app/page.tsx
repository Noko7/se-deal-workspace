import { cookies } from "next/headers";
import { buildAllAccountsKnowledgeBase } from "@/lib/account-ai";
import { toCalendarMeeting } from "@/lib/calendar";
import { getAccountsOverview, getDashboardData, resolveSeOwner } from "@/lib/data";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { AccountAiWorkspace, type AccountOption } from "@/components/account-ai-workspace";

export const dynamic = "force-dynamic";

export default async function AccountAiHomePage() {
  const [overview, { meetings }, portfolio, store] = await Promise.all([
    getAccountsOverview(),
    getDashboardData(),
    buildAllAccountsKnowledgeBase(),
    cookies(),
  ]);

  // Scope the account list to the logged-in SE's book of business.
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const se = resolveSeOwner(
    overview.map((account) => account.owner),
    session?.name,
  );
  const myOverview = se ? overview.filter((account) => account.owner === se) : overview;

  const accounts: AccountOption[] = myOverview.map((account) => ({
    id: account.id,
    accountName: account.accountName,
    dealName: account.name,
    stage: account.stage,
    owner: account.owner,
    nextAction: account.nextAction,
    latestSignal: account.latestSignal,
  }));

  const calendarMeetings = meetings.map(toCalendarMeeting);

  return (
    <AccountAiWorkspace
      accounts={accounts}
      meetings={calendarMeetings}
      aggregate={{
        accountCount: portfolio.summary.accountCount,
        meetingCount: portfolio.summary.meetingCount,
        noteCount: portfolio.summary.noteCount,
        assetCount: portfolio.summary.assetCount,
      }}
    />
  );
}
