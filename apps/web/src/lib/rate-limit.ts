import { createAdminClient } from "@/lib/supabase/admin";

/** true = allowed. Fails open if the limiter itself errors (availability over strictness for MVP). */
export async function rateLimit(key: string, max: number, windowSeconds = 60) {
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  return error ? true : Boolean(data);
}

export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
