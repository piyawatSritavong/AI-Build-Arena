"use client";

import { useActionState } from "react";
import { createToken, type TokenState } from "./token-actions";

export function McpConnect({ mcpUrl }: { mcpUrl: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createToken, {});
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
        <div className="space-y-2 rounded-md border border-green-600/40 p-3 text-sm">
          <p className="font-medium">Copy now — this token is shown only once.</p>
          <p className="opacity-80">Claude Code:</p>
          <pre className="overflow-x-auto rounded bg-foreground/5 p-2 text-xs">
            {`claude mcp add --transport http arena ${mcpUrl} --header "Authorization: Bearer ${state.token}"`}
          </pre>
          <p className="opacity-80">Other clients: URL <code>{mcpUrl}</code> with header <code>Authorization: Bearer {state.token}</code></p>
        </div>
      )}
    </div>
  );
}
