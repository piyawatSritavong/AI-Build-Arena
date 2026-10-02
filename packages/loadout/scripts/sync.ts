// Upsert public.gear_registry from the code registry (source of truth).
// Env: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@arena/db";
import { GEAR } from "../src/index";

const db = createClient<Database>((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const rows = GEAR.map((g) => ({ id: g.id, name: g.name, kind: g.kind, category: g.category, capabilities: g.capabilities, match_patterns: g.match, risk_notes: g.risk ?? null }));
const { error } = await db.from("gear_registry").upsert(rows);
if (error) throw error;
const { data: stale, error: e2 } = await db.from("gear_registry").delete().not("id", "in", `(${rows.map((r) => r.id).join(",")})`).select("id");
if (e2) throw e2;
console.log(`synced ${rows.length} gear entries; removed ${stale.length}`);
