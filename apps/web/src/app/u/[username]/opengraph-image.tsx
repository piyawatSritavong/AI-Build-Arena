import { ImageResponse } from "next/og";
import { auraFor, auraStage, getSprite, spriteDataUri, STAGE_NAMES } from "@arena/core";
import { fmt, getProfileCard, rankLabel, signed } from "@/lib/cards";

export const alt = "AI Build Arena profile card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const card = await getProfileCard(username);
  const aura = auraFor(card?.top_category);
  const stage = card ? auraStage(card.passed, card.avg_lift) : 0;
  const stats: [string, string][] = card
    ? [
        ["Passed", String(card.passed)],
        ["Score", fmt(card.total_score, 0)],
        ["Avg Lift", signed(card.avg_lift)],
        ["Rank", rankLabel(card)],
      ]
    : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b1020", color: "#f8fafc", fontFamily: "sans-serif" }}>
        <div
          style={{
            width: 520,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundImage: `radial-gradient(circle, ${aura.color}${stage ? "88" : "33"} 0%, #0b1020 70%)`,
          }}
        >
          <img src={spriteDataUri(getSprite(card?.build?.sprite_id), 26)} width={312} height={312} alt="" />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px 0 20px" }}>
          <div style={{ fontSize: 28, color: aura.color, display: "flex" }}>
            {aura.label} · Stage {stage} {STAGE_NAMES[stage]}
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, display: "flex" }}>{card ? (card.display_name ?? card.username) : "Unknown builder"}</div>
          <div style={{ fontSize: 30, opacity: 0.7, display: "flex" }}>
            {card ? `@${card.username} · ${card.build?.base_model ?? "no build"}` : ""}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 40 }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", padding: "16px 24px", borderRadius: 16, background: "#1e2540" }}>
                <div style={{ fontSize: 22, opacity: 0.6, display: "flex" }}>{k}</div>
                <div style={{ fontSize: 44, fontWeight: 700, display: "flex" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, fontSize: 26, opacity: 0.6, display: "flex" }}>AI Build Arena</div>
        </div>
      </div>
    ),
    size,
  );
}
