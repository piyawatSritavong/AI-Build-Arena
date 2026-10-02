import { redirect } from "next/navigation";
import Link from "next/link";
import { KNOWN_MODELS, SPRITES } from "@arena/core";
import { SpriteView } from "@/components/sprite";
import { createClient } from "@/lib/supabase/server";
import { saveBuild } from "./actions";
import { ProWaitlist } from "@/components/pro-waitlist";
import { McpConnect } from "./mcp-connect";
import { revokeToken } from "./token-actions";

const input = "w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2";

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/me");

  const [{ data: profile }, { data: build }, { data: tokens }, { count: attempts }] = await Promise.all([
    supabase.from("profiles").select("username, display_name, avatar_url").eq("id", auth.user.id).single(),
    supabase.from("builds").select("name, base_model, client, gear, sprite_id").eq("user_id", auth.user.id).eq("is_primary", true).maybeSingle(),
    supabase.from("api_tokens").select("id, name, token_prefix, last_used_at").is("revoked_at", null).order("created_at"),
    supabase.from("attempts").select("id", { count: "exact", head: true }).neq("status", "issued"),
  ]);
  const steps = [
    { done: Boolean(build), label: "Describe your build (model, client, gear)" },
    { done: Boolean(tokens?.length), label: "Connect your AI with an MCP token" },
    { done: (attempts ?? 0) > 0, label: "Have your AI solve its first challenge" },
  ];
  const mcpUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/mcp`;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-8 px-4 py-10">
      <header className="flex items-center gap-4">
        {profile?.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="size-14 rounded-full" />
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{profile?.display_name ?? profile?.username}</h1>
          <p className="text-sm opacity-70">
            @{profile?.username} ·{" "}
            <Link href={`/u/${profile?.username}`} className="underline">
              public card
            </Link>
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm underline opacity-70">Sign out</button>
        </form>
      </header>

      {steps.some((st) => !st.done) && (
        <ol className="space-y-1 rounded-xl border border-foreground/15 p-4 text-sm">
          <p className="mb-1 font-semibold">Get on the board (~3 min)</p>
          {steps.map((st, i) => (
            <li key={st.label} className={st.done ? "opacity-50 line-through" : ""}>
              {st.done ? "✅" : `${i + 1}.`} {st.label}
            </li>
          ))}
          <li>
            4. Share{" "}
            <Link href={`/u/${profile?.username}`} className="underline">
              your card
            </Link>
          </li>
        </ol>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">My AI Build</h2>
        {saved && <p className="text-sm text-green-600">Saved.</p>}
        {error && <p className="text-sm text-red-500">Could not save ({String(error)}).</p>}
        <form action={saveBuild} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Build name</span>
            <input name="name" required maxLength={60} defaultValue={build?.name ?? ""} className={input} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Base model (self-declared)</span>
            <select name="base_model" defaultValue={build?.base_model ?? "claude-opus-5-5"} className={input}>
              {KNOWN_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Client</span>
            <select name="client" defaultValue={build?.client ?? "claude-code"} className={input}>
              <option value="claude-code">Claude Code</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
              <option value="chatgpt">ChatGPT</option>
              <option value="claude-desktop">Claude Desktop</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Gear (comma or newline separated, self-declared)</span>
            <textarea name="gear" rows={3} defaultValue={((build?.gear as string[] | null) ?? []).join(", ")} className={input} />
          </label>
          <fieldset className="space-y-1 text-sm">
            <legend>Pixel form (your look; the aura is earned)</legend>
            <div className="grid grid-cols-6 gap-2">
              {SPRITES.map((sp) => (
                <label key={sp.id} title={sp.name} className="flex cursor-pointer justify-center rounded-md border border-foreground/15 p-1 has-[:checked]:border-foreground has-[:checked]:bg-foreground/10">
                  <input type="radio" name="sprite_id" value={sp.id} defaultChecked={(build?.sprite_id ?? "starter-1") === sp.id} className="sr-only" />
                  <SpriteView id={sp.id} px={4} />
                </label>
              ))}
            </div>
          </fieldset>
          <button className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90">Save build</button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Connect your AI (MCP)</h2>
        <p className="text-sm opacity-80">Add the Arena as a remote MCP server, then ask your AI to list challenges and solve one.</p>
        <McpConnect mcpUrl={mcpUrl} />
        {!!tokens?.length && (
          <ul className="divide-y divide-foreground/10 text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span>
                  {t.name} <code className="opacity-60">{t.token_prefix}…</code>
                  <span className="ml-2 opacity-60">{t.last_used_at ? `used ${new Date(t.last_used_at).toLocaleDateString()}` : "never used"}</span>
                </span>
                <form action={revokeToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-red-500 underline">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProWaitlist />
    </main>
  );
}
