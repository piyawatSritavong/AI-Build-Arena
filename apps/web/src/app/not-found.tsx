import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";

// Next adds noindex to 404 responses itself.
export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <PageShell
      width="max-w-xl"
      back={<BackButton fallbackHref="/" />}
      footerLeft={<Link href="/leaderboard" className={btnSecondary}>Leaderboard</Link>}
      footerRight={<Link href="/" className={btnPrimary}>Go home →</Link>}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="opacity-80">This page or builder doesn&apos;t exist (yet). Check the link, or find builders on the leaderboard.</p>
      </div>
    </PageShell>
  );
}
