import { redirect } from "next/navigation";

// Per-opportunity pages merged into the account workspace. The account page
// resolves any deal id to its account and auto-expands that opportunity's
// workspace, so old /deals/{id} links keep working.
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/accounts/${encodeURIComponent(id)}`);
}
