import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel Cron (vercel.json): one tiny query so a quiet Supabase Free project is never paused for inactivity.
 * When CRON_SECRET is set, Vercel sends it as a bearer token and anything else is rejected.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { count, error } = await createPublicClient().from("challenges").select("id", { count: "exact", head: true });
  if (error) {
    console.error("keepalive failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, challenges: count });
}
