import { redeemDeviceCode } from "@/lib/cli-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** CLI step 2: poll until the user approves; returns the API token exactly once. */
export async function POST(request: Request) {
  if (!(await rateLimit(`cli-token:${clientIp(request.headers)}`, 60))) {
    return Response.json({ error: "slow_down" }, { status: 429, headers: { "Retry-After": "10" } });
  }
  const body = (await request.json().catch(() => ({}))) as { device_code?: unknown };
  if (typeof body.device_code !== "string" || body.device_code.length > 100) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const r = await redeemDeviceCode(body.device_code);
    switch (r.status) {
      case "ok":
        return Response.json({ token: r.token, username: r.username });
      case "pending":
        return Response.json({ error: "authorization_pending" }, { status: 428 });
      case "too_many_tokens":
        return Response.json({ error: "too_many_tokens", message: "You already have 5 active tokens. Revoke one at /me, then the CLI will continue." }, { status: 409 });
      case "expired":
        return Response.json({ error: "expired_token" }, { status: 410 });
      default:
        return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
  } catch (e) {
    console.error("cli token:", e instanceof Error ? e.message : e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
