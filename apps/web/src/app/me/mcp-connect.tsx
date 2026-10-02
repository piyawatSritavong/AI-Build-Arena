"use client";

import { useActionState, useState } from "react";
import { CopyBlock } from "@/components/copy-button";
import { createToken, type TokenState } from "./token-actions";

const CLIENTS = ["Claude Code", "Claude Desktop", "Cursor", "Codex"] as const;

function snippet(client: (typeof CLIENTS)[number], url: string, token: string) {
  const header = `Authorization: Bearer ${token}`;
  switch (client) {
    case "Claude Code":
      return `claude mcp add --transport http arena ${url} --header "${header}"`;
    case "Claude Desktop":
      return JSON.stringify({ mcpServers: { arena: { command: "npx", args: ["-y", "mcp-remote", url, "--header", header] } } }, null, 2);
    case "Cursor":
      return JSON.stringify({ mcpServers: { arena: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
    case "Codex":
      return `[mcp_servers.arena]\ncommand = "npx"\nargs = ["-y", "mcp-remote", "${url}", "--header", "${header}"]`;
  }
}

const WHERE: Record<(typeof CLIENTS)[number], string> = {
  "Claude Code": "Run in your terminal:",
  "Claude Desktop": "Merge into claude_desktop_config.json, then restart Claude Desktop:",
  Cursor: "Merge into ~/.cursor/mcp.json:",
  Codex: "Append to ~/.codex/config.toml:",
};

export const FIRST_PROMPT =
  'Use the arena MCP: list the challenges, start "sum-of-evens", solve it by writing and running code, then submit the answer with submit_answer.';

export function McpConnect({ mcpUrl }: { mcpUrl: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createToken, {});
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("Claude Code");
  return (
    <div className="space-y-3">
      <form action={action} className="flex gap-2">
        <input name="name" placeholder="Token name (e.g. laptop)" maxLength={40} className="flex-1 rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm" />
        <button disabled={pending} className="rounded-md bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50">
          {pending ? "Creating…" : "Create token"}
        </button>
      </form>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.token && (
        <div className="space-y-3 rounded-md border border-emerald-600/40 p-3 text-sm">
          <p className="font-medium">Copy now — this token is shown only once. It lives only in your local config.</p>
          <div className="flex flex-wrap gap-1">
            {CLIENTS.map((c) => (
              <button key={c} type="button" onClick={() => setClient(c)} className={`rounded-full px-3 py-1 text-xs ${c === client ? "bg-foreground text-background" : "border border-foreground/20"}`}>
                {c}
              </button>
            ))}
          </div>
          <CopyBlock label={WHERE[client]} text={snippet(client, mcpUrl, state.token)} />
          <CopyBlock label="Then ask your AI:" text={FIRST_PROMPT} />
        </div>
      )}
    </div>
  );
}
