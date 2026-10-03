import { abandonAttempt, ABANDON_REASONS, type AbandonReason } from "@arena/mcp";
import { userFromBearer } from "@/lib/cli-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined);
const usd = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e5 ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const isReason = (v: unknown): v is AbandonReason => (ABANDON_REASONS as readonly unknown[]).includes(v);

/** CLI: close an attempt the agent could not finish for a reason outside the challenge (no pass, no fail, no flag). */
export async function POST(request: Request, ctx: RouteContext<"/api/cli/attempts/[id]/abandon">) {
  const userId = await userFromBearer(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`cli-user:${userId}`, 60))) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isReason(body.reason)) return Response.json({ error: "invalid_request", message: `reason must be one of ${ABANDON_REASONS.join(", ")}` }, { status: 400 });
  const r = await abandonAttempt(
    { db: createAdminClient(), userId, source: "cli" },
    { attemptId: id, reason: body.reason, tokensMeasured: int(body.tokens), costUsd: usd(body.cost_usd), model: text(body.model, 80), client: text(body.client, 40) },
  );
  if (!r.ok) return Response.json({ error: "rejected", message: r.error }, { status: 409 });
  return Response.json({ status: r.status });
}
