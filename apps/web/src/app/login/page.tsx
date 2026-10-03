import { BackButton } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary } from "@/components/ui";
import { signInWithGitHub } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <PageShell
      width="max-w-xl"
      back={<BackButton fallbackHref="/" label="Cancel" />}
      footerRight={
        <button form="login-form" className={btnPrimary}>
          Continue with GitHub →
        </button>
      }
    >
      <div className="space-y-4 pt-8">
        <h1 className="text-2xl font-semibold">Sign in to SetupTier</h1>
        <p className="opacity-80">Use GitHub to save your build, get an MCP token for your AI and appear on the leaderboard.</p>
        <ul className="list-inside list-disc text-sm opacity-70">
          <li>We read your public profile and email only. No repository access.</li>
          <li>Trend Check and Loadout Doctor work without signing in.</li>
        </ul>
        {error && <p className="text-sm text-red-500">Sign-in failed. Please try again.</p>}
        <form id="login-form" action={signInWithGitHub}>
          <input type="hidden" name="next" value={typeof next === "string" ? next : "/me"} />
        </form>
      </div>
    </PageShell>
  );
}
