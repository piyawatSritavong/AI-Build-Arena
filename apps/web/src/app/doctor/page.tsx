import { createClient } from "@/lib/supabase/server";
import { DoctorClient } from "./doctor-client";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({
  title: "Loadout Doctor: MCP, skills and hooks config checker",
  description: "Paste claude_desktop_config.json, .mcp.json, Claude Code settings or Codex config.toml to find redundant, bloated, conflicting and risky AI gear, plus the token cost of your MCP tool definitions. Runs in your browser.",
  path: "/doctor",
});

export default async function DoctorPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <DoctorClient signedIn={Boolean(data?.claims)} />;
}
