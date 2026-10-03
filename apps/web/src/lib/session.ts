import { createClient } from "@/lib/supabase/server";

/** Signed-in viewer (id + username) or null. */
export async function getViewer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: p } = await supabase.from("profiles").select("username").eq("id", sub).maybeSingle();
  return p ? { id: sub, username: p.username } : null;
}
