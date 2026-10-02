/** Only allow same-origin relative redirects (blocks open redirects like //evil.com). */
export function safeNext(next: string | null | undefined, fallback = "/me") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Canonical origin; request.nextUrl may report localhost while the browser uses 127.0.0.1 (cookies are per-host). */
export function siteOrigin(fallback: string) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? fallback;
}
