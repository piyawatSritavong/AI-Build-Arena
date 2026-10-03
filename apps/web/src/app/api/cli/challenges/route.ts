import { getChallenge } from "@arena/challenges";
import { createPublicClient } from "@/lib/supabase/public";

/** Active challenges for `setuptier run --all` (public data). */
export async function GET() {
  const { data, error } = await createPublicClient()
    .from("challenges")
    .select("id, league, category, title, difficulty, time_limit_seconds")
    .eq("is_active", true)
    .order("difficulty");
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json({ challenges: data.filter((c) => getChallenge(c.id)) });
}
