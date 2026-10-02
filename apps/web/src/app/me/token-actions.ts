"use server";

import { revalidatePath } from "next/cache";
import { generateApiToken } from "@arena/mcp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_ACTIVE_TOKENS = 5;

export type TokenState = { token?: string; error?: string };

export async function createToken(_prev: TokenState, formData: FormData): Promise<TokenState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Not signed in." };

  const { count } = await supabase.from("api_tokens").select("id", { count: "exact", head: true }).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) return { error: `Limit of ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.` };

  const name = String(formData.get("name") ?? "").trim().slice(0, 40) || "default";
  const { raw, prefix, hash } = await generateApiToken();
  const { error } = await createAdminClient()
    .from("api_tokens")
    .insert({ user_id: auth.user.id, name, token_prefix: prefix, token_hash: hash });
  if (error) return { error: "Could not create token." };
  revalidatePath("/me");
  return { token: raw };
}

export async function revokeToken(formData: FormData) {
  const supabase = await createClient(); // RLS + column grant: only own tokens, only revoked_at
  await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", String(formData.get("id")));
  revalidatePath("/me");
}
