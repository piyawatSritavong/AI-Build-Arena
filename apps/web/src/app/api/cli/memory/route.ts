import { userFromBearer } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** CLI: Memory Fitness rounds per variant (status + exam dates), for `setuptier memory` and the due-exam reminder. */
export async function GET(request: Request) {
  const userId = await userFromBearer(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await createAdminClient().rpc("memory_stats", { p_user: userId });
  return Response.json({ rounds: data ?? [], now: new Date().toISOString() });
}
