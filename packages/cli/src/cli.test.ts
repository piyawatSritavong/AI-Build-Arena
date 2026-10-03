import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@arena/db";
import { scanMachine } from "./scan";

// Fake credential assembled at runtime so secret scanners do not flag this file.
const FAKE_GH = ["gh", "p_", "fixturefixturefixturefixture1234567890"].join("");

describe("scanMachine (privacy)", () => {
  let home = "";
  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "setuptier-home-"));
    process.env.SETUPTIER_HOME = home;
    await mkdir(join(home, ".claude", "skills", "my-skill"), { recursive: true });
    await writeFile(
      join(home, ".claude.json"),
      JSON.stringify({
        projects: { "/Users/fixture/client-acme": { mcpServers: { fs: { command: "npx", args: ["@modelcontextprotocol/server-filesystem", "/Users/fixture/client-acme"] } } } },
        mcpServers: { github: { command: "npx", args: ["@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: FAKE_GH } } },
      }),
    );
    await writeFile(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: "node /Users/fixture/hooks/guard.js --strict" }] }] } }),
    );
    await writeFile(join(home, ".claude", "CLAUDE.md"), "TOP SECRET INSTRUCTIONS for client-acme");
  });
  afterAll(async () => {
    delete process.env.SETUPTIER_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("uploads names and findings only", async () => {
    const { payload, found } = await scanMachine();
    const text = JSON.stringify(payload);
    expect(found.map((f) => f.source)).toEqual(["claude-code"]);
    expect(text).not.toMatch(/fixture|client-acme|TOP SECRET|guard\.js --strict|\/Users/);
    expect(text).not.toContain(FAKE_GH);
    expect(payload.gear.map((g) => g.registryId ?? g.name).sort()).toEqual(["PreToolUse: node guard.js", "filesystem", "github", "my-skill"]);
    expect(payload.instructions).toEqual({ user: true, project: false });
    expect(payload.findings.some((f) => f.type === "security-risk" && f.message.includes("GITHUB_TOKEN"))).toBe(true);
  });
});

// End-to-end against a running web app: device sign-in → token → whoami → scan upload.
const url = process.env.ARENA_E2E_URL;
describe.skipIf(!url)("CLI device sign-in e2e", () => {
  const db = url ? createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } }) : null!;
  let userId = "";
  const post = (path: string, body: unknown, token?: string) =>
    fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  beforeAll(async () => {
    const { data, error } = await db.auth.admin.createUser({ email: `cli-e2e-${Date.now()}@arena.test`, email_confirm: true, user_metadata: { user_name: "cli-e2e" } });
    if (error) throw error;
    userId = data.user.id;
  });
  afterAll(async () => {
    if (userId) await db.auth.admin.deleteUser(userId);
  });

  it("signs in once, then uploads a scan", async () => {
    const start = (await (await post("/api/cli/device", { client_name: "e2e box" })).json()) as { device_code: string; user_code: string; verification_uri_complete: string };
    expect(start.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(start.verification_uri_complete).toContain(`/cli?code=${start.user_code}`);

    expect((await post("/api/cli/token", { device_code: start.device_code })).status).toBe(428); // not approved yet

    // The browser approval is a signed-in server action; here we approve the same row directly.
    await db.from("cli_device_codes").update({ user_id: userId, approved_at: new Date().toISOString() }).eq("user_code", start.user_code);
    const ok = await post("/api/cli/token", { device_code: start.device_code });
    expect(ok.status).toBe(200);
    const { token, username } = (await ok.json()) as { token: string; username: string };
    expect(token).toMatch(/^aba_/);
    expect((await post("/api/cli/token", { device_code: start.device_code })).status).toBe(410); // single use

    const who = await fetch(`${url}/api/cli/whoami`, { headers: { Authorization: `Bearer ${token}` } });
    expect(((await who.json()) as { username: string }).username).toBe(username);

    const { data: tok } = await db.from("api_tokens").select("name").eq("user_id", userId).single();
    expect(tok!.name).toBe("CLI · e2e box");

    const scan = await post(
      "/api/cli/scan",
      {
        version: 1,
        cli: "0.1.0",
        sources: ["claude-code"],
        instructions: { user: true, project: false },
        gear: [{ name: "github", kind: "mcp", registryId: "github", category: "git-hosting" }, { name: "evil /Users/x/y", kind: "mcp", registryId: null, category: null }],
        findings: [],
        summary: { total: 2, byKind: { mcp: 2 }, matched: 1, unknown: 1, mcpServers: 2, estToolTokens: 1400, cleanBuild: true },
      },
      token,
    );
    expect(scan.status).toBe(200);
    const { data: rows } = await db.from("loadout_scans").select("source, gear").eq("user_id", userId);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.source).toBe("cli");
    expect(JSON.stringify(rows![0]!.gear)).not.toContain("/Users"); // re-sanitized on the server

    expect((await post("/api/cli/scan", { version: 1 }, "aba_nope")).status).toBe(401);
  });
});
