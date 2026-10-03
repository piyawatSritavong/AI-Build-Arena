import { startAttempt } from "@arena/mcp";
import { userFromBearer } from "@/lib/cli-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/** CLI: start an attempt. The CLI hands the task to the local agent and submits the answer itself. */
export async function POST(request: Request) {
  const userId = await userFromBearer(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`cli-user:${userId}`, 60))) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  const body = (await request.json().catch(() => ({}))) as { challenge_id?: unknown; variant?: unknown; mode?: unknown };
  if (typeof body.challenge_id !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });
  const variant = body.variant === "stock" ? "stock" : "full";
  const mode = body.mode === "practice" ? "practice" : "ranked";
  const r = await startAttempt({ db: createAdminClient(), userId, source: "cli" }, { challengeId: body.challenge_id, variant, mode });
  if (!r.ok) return Response.json({ error: "rejected", message: r.error }, { status: 409 });
  return Response.json({ ...r, ok: undefined }); // JSON drops the internal flag
}
