import { after, NextResponse, type NextRequest } from "next/server";
import { recordGithubAge } from "@/lib/github-age";
import { createClient } from "@/lib/supabase/server";
import { safeNext, siteOrigin } from "@/lib/safe-next";
import { track } from "@/lib/track";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = siteOrigin(request.nextUrl.origin);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await track("signed_in", data.user.id, { new_user: Date.now() - new Date(data.user.created_at).getTime() < 60_000 });
      after(() => recordGithubAge(data.user)); // anti-cheat: account age → trust score, after the redirect
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
