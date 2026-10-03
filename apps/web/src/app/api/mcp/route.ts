import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateToken, createArenaMcpServer } from "@arena/mcp";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// Stateless Streamable HTTP: a fresh server + transport per request.
const limited = (message: string) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32029, message }, id: null }, { status: 429, headers: { "Retry-After": "60" } });

async function handle(request: Request) {
  if (!(await rateLimit(`mcp-ip:${clientIp(request.headers)}`, 120))) return limited("Too many requests from this IP. Slow down.");
  const auth = request.headers.get("authorization");
  // ?token= is a fallback for clients that cannot set headers; prefer the Authorization header.
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : new URL(request.url).searchParams.get("token");
  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    console.error("MCP admin client:", e instanceof Error ? e.message : e);
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Server misconfigured." }, id: null }, { status: 500 });
  }
  const userId = token ? await authenticateToken(db, token) : null;
  if (!userId) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid API token. Create one at /me." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="setuptier"' } },
    );
  }
  if (!(await rateLimit(`mcp-user:${userId}`, 60))) return limited("Rate limit: 60 MCP requests per minute.");
  const server = createArenaMcpServer({ db, userId });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
