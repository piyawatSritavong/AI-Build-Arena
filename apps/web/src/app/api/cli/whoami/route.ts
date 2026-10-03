import { userFromBearer } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const userId = await userFromBearer(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await createAdminClient().from("profiles").select("username, display_name").eq("id", userId).single();
  return Response.json({ username: data?.username, display_name: data?.display_name });
}
