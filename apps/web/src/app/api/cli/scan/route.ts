import { parseScanPayload } from "@arena/loadout";
import { userFromBearer } from "@/lib/cli-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE } from "@/lib/site";
import { track } from "@/lib/track";

/** Upload a CLI loadout scan (names, kinds and findings only; re-sanitized here). */
export async function POST(request: Request) {
  const userId = await userFromBearer(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`cli-scan:${userId}`, 10))) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  if (Number(request.headers.get("content-length") ?? 0) > 200_000) return Response.json({ error: "too_large" }, { status: 413 });

  const payload = parseScanPayload(await request.json().catch(() => null));
  if (!payload) return Response.json({ error: "invalid_payload" }, { status: 400 });

  const db = createAdminClient();
  const { data: build } = await db.from("builds").select("id").eq("user_id", userId).eq("is_primary", true).maybeSingle();
  const { data: scan, error } = await db
    .from("loadout_scans")
    .insert({
      user_id: userId,
      build_id: build?.id ?? null,
      source: "cli",
      gear: payload.gear,
      findings: payload.findings,
      summary: { ...payload.summary, sources: payload.sources, instructions: payload.instructions, cli: payload.cli },
    })
    .select("id")
    .single();
  if (error) {
    console.error("cli scan insert:", error.message);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  await track("cli_scan_uploaded", userId, { items: payload.gear.length, findings: payload.findings.length, has_build: Boolean(build) });
  return Response.json({ id: scan.id, items: payload.gear.length, findings: payload.findings.length, report_url: `${SITE.url}/me` });
}
