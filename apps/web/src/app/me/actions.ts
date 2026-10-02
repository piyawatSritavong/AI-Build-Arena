"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { KNOWN_MODELS } from "@arena/core";
import { createClient } from "@/lib/supabase/server";

const CLIENTS = ["claude-code", "codex", "cursor", "chatgpt", "claude-desktop", "other"] as const;

export async function saveBuild(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const baseModelRaw = String(formData.get("base_model") ?? "");
  const baseModel = (KNOWN_MODELS as readonly string[]).includes(baseModelRaw) ? baseModelRaw : "other";
  const clientRaw = String(formData.get("client") ?? "");
  const client = (CLIENTS as readonly string[]).includes(clientRaw) ? clientRaw : "other";
  const gear = String(formData.get("gear") ?? "")
    .split(/[,\n]/)
    .map((g) => g.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 50);
  if (!name || !baseModel) redirect("/me?error=missing");

  const row = { name, base_model: baseModel, client, gear };
  const { data: existing } = await supabase
    .from("builds")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("is_primary", true)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("builds").update(row).eq("id", existing.id)
    : await supabase.from("builds").insert({ ...row, user_id: auth.user.id });
  if (error) redirect("/me?error=save");

  revalidatePath("/me");
  redirect("/me?saved=1");
}
