import { createClient } from "@/lib/supabase/server";
import { DoctorClient } from "./doctor-client";

export const metadata = { title: "Loadout Doctor · AI Build Arena", description: "Find redundant, bloated and risky gear in your AI setup." };

export default async function DoctorPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <DoctorClient signedIn={Boolean(data?.claims)} />;
}
