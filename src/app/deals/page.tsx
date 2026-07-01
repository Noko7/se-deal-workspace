import { redirect } from "next/navigation";

// The standalone Current Deals page merged into the account workspace: every
// account page now carries its opportunities as collapsible deal workspaces.
export default function DealsPage() {
  redirect("/accounts");
}
