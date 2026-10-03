import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arena/db";

const PREFIX = "aba_";

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** New raw token (shown to the user once) + what we store. */
export async function generateApiToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { raw, prefix: raw.slice(0, PREFIX.length + 6), hash: await sha256Hex(raw) };
}

/** Resolve a bearer token to a user id (service-role client). */
export async function authenticateToken(db: SupabaseClient<Database>, raw: string): Promise<string | null> {
  if (!raw.startsWith(PREFIX) || raw.length > 100) return null;
  const hash = await sha256Hex(raw);
  const { data } = await db.from("api_tokens").select("id, user_id").eq("token_hash", hash).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id;
}
