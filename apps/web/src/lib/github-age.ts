import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Anti-cheat v1: record when the GitHub account was created (public API, no token), then refresh the trust score.
 * Fetched once per account; any failure leaves the age unknown (trust treats it as neutral-low).
 */
export async function recordGithubAge(user: User) {
  const db = createAdminClient();
  const githubId = user.app_metadata?.provider === "github" ? String(user.user_metadata?.provider_id ?? "") : "";
  if (/^\d+$/.test(githubId)) {
    const { data: profile } = await db.from("profiles").select("github_created_at").eq("id", user.id).single();
    if (!profile?.github_created_at) {
      try {
        const res = await fetch(`https://api.github.com/user/${githubId}`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "setuptier" },
          signal: AbortSignal.timeout(4000),
        });
        const gh = res.ok ? ((await res.json()) as { created_at?: string }) : null;
        if (gh?.created_at && !Number.isNaN(Date.parse(gh.created_at))) {
          await db.from("profiles").update({ github_created_at: gh.created_at }).eq("id", user.id);
        }
      } catch {
        // rate-limited or offline: try again at the next sign-in
      }
    }
  }
  await db.rpc("refresh_trust_score", { p_user: user.id });
}
