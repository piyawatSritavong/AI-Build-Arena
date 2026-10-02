import { signInWithGitHub } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Sign in to AI Build Arena</h1>
      {error && <p className="text-sm text-red-500">Sign-in failed. Please try again.</p>}
      <form action={signInWithGitHub}>
        <input type="hidden" name="next" value={typeof next === "string" ? next : "/me"} />
        <button className="w-full rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90">
          Continue with GitHub
        </button>
      </form>
    </main>
  );
}
