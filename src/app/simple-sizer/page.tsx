import { SimpleSizerTool } from "@/components/simple-sizer-tool";
import { readSizerStats } from "@/lib/sizer-stats-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Simple Sizer · SE Deal Workspace",
};

export default async function SimpleSizerPage() {
  return <SimpleSizerTool initialStats={await readSizerStats()} />;
}
