import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeNext, siteOrigin } from "@/lib/safe-next";

// LOCAL TESTING ONLY: signs in as a throwaway user without GitHub OAuth.
// Requires ARENA_DEV_LOGIN=1 AND a localhost request; never set the flag in production.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (process.env.ARENA_DEV_LOGIN !== "1" || !LOCAL.test(host)) return new NextResponse(null, { status: 404 });

  const handle = (request.nextUrl.searchParams.get("user") ?? "dev-tester").replace(/[^a-z0-9-]/gi, "").slice(0, 30) || "dev-tester";
  const email = `${handle}@arena.test`;
  const admin = createAdminClient();
  await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { user_name: handle, full_name: `Dev ${handle}` } }).catch(() => undefined);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verifyError) return NextResponse.json({ error: verifyError.message }, { status: 500 });
  return NextResponse.redirect(`${siteOrigin(request.nextUrl.origin)}${safeNext(request.nextUrl.searchParams.get("next"))}`);
}
