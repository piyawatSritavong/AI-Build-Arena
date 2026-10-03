import { submitAttempt } from "@arena/mcp";
import { userFromBearer } from "@/lib/cli-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** CLI: submit the agent's answer with the token count Claude Code reported for the run. */
export async function POST(request: Request, ctx: RouteContext<"/api/cli/attempts/[id]/submit">) {
  const userId = await userFromBearer(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`cli-user:${userId}`, 60))) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const answer = text(body.answer, 200_000);
  if (answer === undefined) return Response.json({ error: "invalid_request" }, { status: 400 });
  const r = await submitAttempt(
    { db: createAdminClient(), userId, source: "cli" },
    { attemptId: id, answer, model: text(body.model, 80), tokensMeasured: int(body.tokens), client: text(body.client, 40) },
  );
  if (!r.ok) return Response.json({ error: "rejected", message: r.error }, { status: 409 });
  return Response.json({ ...r, ok: undefined }); // JSON drops the internal flag
}
