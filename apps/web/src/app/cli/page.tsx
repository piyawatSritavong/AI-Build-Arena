import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { normalizeUserCode, pendingCodeInfo } from "@/lib/cli-auth";
import { getViewer } from "@/lib/session";
import { pageMeta } from "@/lib/site";
import { approveCli } from "./actions";

export const metadata = pageMeta({ title: "Connect the CLI", path: "/cli", noindex: true });

const CAN = [
  "Start challenges and submit answers as you (Full and Stock runs)",
  "Upload loadout scans: tool names, kinds and findings only",
];
const CANNOT = ["Read your code, files, prompts or CLAUDE.md content", "See secret values (only their variable names, as findings)", "Change your config without asking you first"];

export default async function CliPage({ searchParams }: PageProps<"/cli">) {
  const { code: raw, done, error } = await searchParams;
  const code = typeof raw === "string" ? normalizeUserCode(raw) : "";
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(code ? `/cli?code=${code}` : "/cli")}`);

  if (done) {
    return (
      <PageShell width="max-w-xl" back={<BackLink href="/me" label="My build" />} footerRight={<Link href="/me" className={btnPrimary}>Go to my build →</Link>}>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">CLI connected ✓</h1>
          <p className="opacity-80">Return to your terminal: the CLI is signed in as @{viewer.username}. You can close this tab.</p>
        </div>
      </PageShell>
    );
  }

  const info = code ? await pendingCodeInfo(code) : null;
  return (
    <PageShell
      width="max-w-xl"
      back={<BackLink href="/" label="Cancel" />}
      footerLeft={<Link href="/" className={btnSecondary}>Cancel</Link>}
      footerRight={
        info ? (
          <button form="cli-form" className={btnPrimary}>Allow →</button>
        ) : (
          <button form="code-form" className={btnPrimary}>Continue →</button>
        )
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Connect the SetupTier CLI</h1>
          <p className="opacity-80">Signed in as @{viewer.username}. Check that the code below matches the one in your terminal.</p>
        </div>

        {info ? (
          <form id="cli-form" action={approveCli} className="space-y-5">
            <input type="hidden" name="code" value={code} />
            <div className="rounded-xl border border-foreground/15 p-5 text-center">
              <p className="font-mono text-3xl font-bold tracking-[0.3em]">{code}</p>
              <p className="mt-2 text-sm opacity-70">Requested by: {info.clientName}</p>
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="space-y-1">
                <p className="font-semibold">The CLI can</p>
                <ul className="list-inside list-disc space-y-1 opacity-80">{CAN.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
              <div className="space-y-1">
                <p className="font-semibold">The CLI cannot</p>
                <ul className="list-inside list-disc space-y-1 opacity-80">{CANNOT.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            </div>
            <p className="text-xs opacity-60">This creates an API token named &quot;CLI · {info.clientName}&quot;. Revoke it any time at /me.</p>
          </form>
        ) : (
          <form id="code-form" method="get" className="space-y-2">
            {code && <p className="text-sm text-red-500">{error ? "That code expired or was already used." : "Code not found or expired."} Run <code>setuptier login</code> again.</p>}
            <label className="block space-y-1 text-sm">
              <span>Code shown in your terminal</span>
              <input name="code" required placeholder="ABCD-EFGH" autoComplete="off" className="w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 font-mono uppercase tracking-widest" />
            </label>
          </form>
        )}
      </div>
    </PageShell>
  );
}
