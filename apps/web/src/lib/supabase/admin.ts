import { createClient } from "@supabase/supabase-js";
import type { Database } from "@arena/db";

/** Service-role client. Server-only: never import from client components. Bypasses RLS — always scope by user id. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key || /\s/.test(key)) throw new Error("SUPABASE_SECRET_KEY is missing or contains whitespace");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
