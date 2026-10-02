"use server";

import type { LoadoutFinding } from "@arena/core";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 20_000;

/** Saves only the parsed report (gear names + findings). Raw configs never reach the server. */
export async function saveScan(summary: Record<string, unknown>, findings: LoadoutFinding[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in to save reports." };
  if (JSON.stringify({ summary, findings }).length > MAX_BYTES || !Array.isArray(findings)) return { ok: false, error: "Report too large." };
  const { data: build } = await supabase.from("builds").select("id").eq("user_id", auth.user.id).eq("is_primary", true).maybeSingle();
  const { error } = await supabase.from("loadout_scans").insert({
    user_id: auth.user.id,
    build_id: build?.id ?? null,
    summary: JSON.parse(JSON.stringify(summary)),
    findings: JSON.parse(JSON.stringify(findings.slice(0, 100))),
  });
  return error ? { ok: false, error: "Could not save." } : { ok: true };
}
