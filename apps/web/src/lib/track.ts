import { createAdminClient } from "@/lib/supabase/admin";

type Props = Record<string, string | number | boolean | null>;

/**
 * Server-side product events: mirrored to public.events (week-2 metrics) and, when configured,
 * to PostHog. Never throws.
 */
export async function track(name: string, userId: string | null, props: Props = {}) {
  await createAdminClient()
    .from("events")
    .insert({ user_id: userId, name, props })
    .then(() => undefined, () => undefined);
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key && userId) {
    await fetch(`${process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, event: name, distinct_id: userId, properties: props }),
    }).catch(() => undefined);
  }
}
