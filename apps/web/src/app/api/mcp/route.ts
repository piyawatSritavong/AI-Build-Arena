import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateToken, createArenaMcpServer } from "@arena/mcp";
import { createAdminClient } from "@/lib/supabase/admin";

// Stateless Streamable HTTP: a fresh server + transport per request.
async function handle(request: Request) {
  const auth = request.headers.get("authorization");
  // ?token= is a fallback for clients that cannot set headers; prefer the Authorization header.
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : new URL(request.url).searchParams.get("token");
  const db = createAdminClient();
  const userId = token ? await authenticateToken(db, token) : null;
  if (!userId) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid API token. Create one at /me." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="ai-build-arena"' } },
    );
  }
  const server = createArenaMcpServer({ db, userId });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
