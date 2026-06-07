import { buildAllAccountsKnowledgeBase } from "@/lib/account-ai";
import { toCalendarMeeting } from "@/lib/calendar";
import { getAccountsOverview, getDashboardData } from "@/lib/data";
import { AccountAiWorkspace, type AccountOption } from "@/components/account-ai-workspace";

export const dynamic = "force-dynamic";

export default async function AccountAiHomePage() {
  const [overview, { meetings }, portfolio] = await Promise.all([
    getAccountsOverview(),
    getDashboardData(),
    buildAllAccountsKnowledgeBase(),
  ]);

  const accounts: AccountOption[] = overview.map((account) => ({
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
