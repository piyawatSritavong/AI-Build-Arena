import { createClient } from "@supabase/supabase-js";
import type { Database } from "@arena/db";

/** Service-role client. Server-only: never import from client components. Bypasses RLS — always scope by user id. */
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
