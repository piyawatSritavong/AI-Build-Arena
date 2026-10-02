// Upsert public.challenges from the code registry; deactivate rows no longer in it.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY (local values in apps/web/.env.local).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@arena/db";
import { challenges } from "../src/index";

const db = createClient<Database>((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const rows = challenges.map((c) => ({
  id: c.id,
  league: c.league,
  category: c.category,
  title: c.title,
  summary: c.summary,
  difficulty: c.difficulty,
  time_limit_seconds: c.timeLimitSeconds,
  version: c.version,
  is_active: true,
}));
const { error } = await db.from("challenges").upsert(rows);
if (error) throw error;
const ids = rows.map((r) => r.id);
const { data: stale, error: e2 } = await db.from("challenges").update({ is_active: false }).not("id", "in", `(${ids.join(",")})`).select("id");
if (e2) throw e2;
console.log(`synced ${rows.length} challenges; deactivated ${stale.length}: ${stale.map((s) => s.id).join(", ") || "-"}`);
