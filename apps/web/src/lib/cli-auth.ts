import { authenticateToken, generateApiToken, sha256Hex } from "@arena/mcp";
import { createAdminClient } from "@/lib/supabase/admin";

// Device authorization for the SetupTier CLI: the CLI holds a secret device code,
// the user approves the short user code in the browser, the CLI swaps the device code for an API token once.

export const DEVICE_CODE_TTL_SECONDS = 600;
export const POLL_INTERVAL_SECONDS = 3;
const MAX_ACTIVE_TOKENS = 5;
const LETTERS = "BCDFGHJKLMNPQRSTVWXZ"; // no vowels (no accidental words), no look-alikes

function userCode() {
  const pick = () => LETTERS[crypto.getRandomValues(new Uint32Array(1))[0]! % LETTERS.length];
  return `${Array.from({ length: 4 }, pick).join("")}-${Array.from({ length: 4 }, pick).join("")}`;
}

function deviceSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const normalizeUserCode = (code: string) => code.toUpperCase().replace(/[^A-Z]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");

export async function startDeviceAuth(clientName: string) {
  const db = createAdminClient();
  const deviceCode = deviceSecret();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = userCode();
    const { error } = await db.from("cli_device_codes").insert({
      device_code_hash: await sha256Hex(deviceCode),
      user_code: code,
      client_name: clientName,
      expires_at: expiresAt.toISOString(),
    });
    if (!error) return { deviceCode, userCode: code, expiresAt };
    if (error.code !== "23505") throw new Error(error.message); // retry only on a user_code collision
  }
  throw new Error("Could not allocate a code.");
}

export type DeviceTokenResult =
  | { status: "pending" | "expired" | "invalid" | "too_many_tokens" }
  | { status: "ok"; token: string; username: string };

/** Called by the polling CLI. Issues the API token exactly once, then the code is spent. */
export async function redeemDeviceCode(deviceCode: string): Promise<DeviceTokenResult> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("cli_device_codes")
    .select("id, user_id, client_name, approved_at, consumed_at, expires_at")
    .eq("device_code_hash", await sha256Hex(deviceCode))
    .maybeSingle();
  if (!row) return { status: "invalid" };
  if (row.consumed_at || new Date(row.expires_at) < new Date()) return { status: "expired" };
  if (!row.approved_at || !row.user_id) return { status: "pending" };

  const { count } = await db.from("api_tokens").select("id", { count: "exact", head: true }).eq("user_id", row.user_id).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) return { status: "too_many_tokens" }; // code stays valid: revoke one, then poll again

  // Claim the code first so two concurrent polls cannot both receive a token.
  const { data: claimed } = await db
    .from("cli_device_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id");
  if (!claimed?.length) return { status: "expired" };

  const { raw, prefix, hash } = await generateApiToken();
  const { error } = await db.from("api_tokens").insert({ user_id: row.user_id, name: `CLI · ${row.client_name}`.slice(0, 40), token_prefix: prefix, token_hash: hash });
  if (error) throw new Error(error.message);
  const { data: profile } = await db.from("profiles").select("username").eq("id", row.user_id).single();
  return { status: "ok", token: raw, username: profile?.username ?? "" };
}

/** Approve a pending code for the signed-in user (from the /cli page). */
export async function approveUserCode(code: string, userId: string) {
  const { data } = await createAdminClient()
    .from("cli_device_codes")
    .update({ user_id: userId, approved_at: new Date().toISOString() })
    .eq("user_code", normalizeUserCode(code))
    .is("approved_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  return Boolean(data?.length);
}

export async function pendingCodeInfo(code: string) {
  const { data } = await createAdminClient()
    .from("cli_device_codes")
    .select("client_name, approved_at, expires_at")
    .eq("user_code", normalizeUserCode(code))
    .maybeSingle();
  if (!data || data.approved_at || new Date(data.expires_at) < new Date()) return null;
  return { clientName: data.client_name };
}

/** Bearer-token auth for /api/cli/* (same tokens as the remote MCP). */
export async function userFromBearer(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return authenticateToken(createAdminClient(), auth.slice(7).trim());
}
