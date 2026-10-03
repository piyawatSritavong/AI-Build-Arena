import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Old production hostnames: pages move permanently to NEXT_PUBLIC_SITE_URL (keeps shared links and SEO). */
const LEGACY_HOSTS = new Set(["ai-build-arena-zeta.vercel.app"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  // /api/ stays put: MCP clients already configured with the old URL may not follow redirects on POST.
  if (host && site && LEGACY_HOSTS.has(host) && !request.nextUrl.pathname.startsWith("/api/")) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, site);
    return NextResponse.redirect(url, 308);
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
