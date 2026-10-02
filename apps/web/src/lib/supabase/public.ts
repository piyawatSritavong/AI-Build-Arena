import { createClient } from "@supabase/supabase-js";
import type { Database } from "@arena/db";

/** Cookie-less anon client for public data (cards, leaderboard, OG images). */
export function createPublicClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
