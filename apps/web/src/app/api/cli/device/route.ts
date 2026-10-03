import { DEVICE_CODE_TTL_SECONDS, POLL_INTERVAL_SECONDS, startDeviceAuth } from "@/lib/cli-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SITE } from "@/lib/site";

/** CLI step 1: get a short code for the user to approve in the browser. */
export async function POST(request: Request) {
  if (!(await rateLimit(`cli-device:${clientIp(request.headers)}`, 10))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const body = (await request.json().catch(() => ({}))) as { client_name?: unknown };
  const clientName = (typeof body.client_name === "string" ? body.client_name : "").replace(/[^\w .()-]/g, "").trim().slice(0, 60) || "SetupTier CLI";
  try {
    const { deviceCode, userCode } = await startDeviceAuth(clientName);
    return Response.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${SITE.url}/cli`,
      verification_uri_complete: `${SITE.url}/cli?code=${userCode}`,
      expires_in: DEVICE_CODE_TTL_SECONDS,
      interval: POLL_INTERVAL_SECONDS,
    });
  } catch (e) {
    console.error("cli device:", e instanceof Error ? e.message : e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
