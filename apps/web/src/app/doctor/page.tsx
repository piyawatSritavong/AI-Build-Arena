import { createClient } from "@/lib/supabase/server";
import { DoctorClient } from "./doctor-client";

export const metadata = { title: "Loadout Doctor · AI Build Arena", description: "Find redundant, bloated and risky gear in your AI setup." };

export default async function DoctorPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Loadout Doctor</h1>
        <p className="opacity-80">Carrying too much? Paste your AI configs to find redundant, bloated and risky gear.</p>
      </div>
      <DoctorClient signedIn={Boolean(data?.claims)} />
    </main>
  );
}
