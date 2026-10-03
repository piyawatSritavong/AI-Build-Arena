import { auraFor, auraStage, LIFT_TRUST_LABEL, liftTrust, STAGE_NAMES, type ProfileCard } from "@arena/core";
import { SpriteView } from "./sprite";
import { fmt, rankLabel, signed } from "@/lib/cards";

export function ArenaCard({ card }: { card: ProfileCard }) {
  const aura = auraFor(card.top_category);
  const stage = auraStage(card.passed, card.avg_lift);
  const rings = [0.55, 0.35, 0.2].slice(0, stage);
  const trust = liftTrust(card);
  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
      <div
        className="relative flex h-56 items-center justify-center"
        style={{ background: `radial-gradient(circle, ${aura.color}${stage ? "66" : "22"} 0%, transparent 70%)` }}
      >
        {rings.map((o, i) => (
          <span
            key={i}
            className="absolute rounded-full border-2"
            style={{ width: 150 + i * 40, height: 150 + i * 40, borderColor: aura.color, opacity: o }}
          />
        ))}
        <SpriteView id={card.build?.sprite_id} px={10} className="relative" />
      </div>
      <div className="space-y-3 p-5">
        <div>
          <p className="text-lg font-semibold">{card.display_name ?? card.username}</p>
          <p className="text-sm opacity-70">
            @{card.username} · {card.build ? `${card.build.name} · ${card.build.base_model}*` : "no build yet"}
          </p>
        </div>
        <p className="text-sm">
          <span className="rounded-full px-2 py-0.5 text-xs font-medium text-black" style={{ background: aura.color }}>
            {aura.label}
          </span>{" "}
          <span className="opacity-70">Stage {stage} · {STAGE_NAMES[stage]}</span>
        </p>
        <dl className="grid grid-cols-4 gap-2 text-center text-sm">
          {[
            ["Passed", String(card.passed)],
            ["Score", fmt(card.total_score, 0)],
            ["Lift", signed(card.avg_lift)],
            ["Rank", rankLabel(card)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-foreground/5 py-2">
              <dt className="text-xs opacity-60">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] opacity-50">
          {trust
            ? `Lift: how much the setup beats the same client with nothing added (−100 to +100), ${LIFT_TRUST_LABEL[trust]}, ${card.lift_challenges} challenge${card.lift_challenges === 1 ? "" : "s"}. `
            : "Lift appears after a Stock run (the same client with nothing added). "}
          * Model and gear are self-declared. Scores come from verified answers.
        </p>
      </div>
    </div>
  );
}
