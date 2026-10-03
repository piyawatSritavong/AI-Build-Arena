"use server";

import { redirect } from "next/navigation";
import { approveUserCode, normalizeUserCode } from "@/lib/cli-auth";
import { getViewer } from "@/lib/session";
import { track } from "@/lib/track";

export async function approveCli(formData: FormData) {
  const code = normalizeUserCode(String(formData.get("code") ?? ""));
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/cli?code=${code}`)}`);
  const ok = await approveUserCode(code, viewer.id);
  if (ok) await track("cli_approved", viewer.id);
  redirect(ok ? "/cli?done=1" : `/cli?code=${code}&error=expired`);
}
