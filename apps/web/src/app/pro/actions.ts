"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/track";

export type WaitlistState = { status?: "joined" | "already" | "signin" | "error" };
const PRICES = new Set(["5", "9", "15", "0"]);

/** Measures willingness to pay: which monthly price the user would accept (0 = "free only"). */
export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "signin" };
  const price = String(formData.get("price") ?? "");
  const { error } = await createAdminClient()
    .from("events")
    .insert({ user_id: auth.user.id, name: "pro_waitlist_joined", props: { price: PRICES.has(price) ? Number(price) : null } });
  if (error?.code === "23505") return { status: "already" };
  if (error) return { status: "error" };
  await track("pro_waitlist_price", auth.user.id, { price: PRICES.has(price) ? Number(price) : null });
  return { status: "joined" };
}
