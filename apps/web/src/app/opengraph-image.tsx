import { ImageResponse } from "next/og";
import { SPRITES, spriteDataUri } from "@arena/core";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TIERS: [string, string][] = [
  ["S", "#f43f5e"],
  ["A", "#f59e0b"],
  ["B", "#22c55e"],
  ["C", "#38bdf8"],
];

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", background: "#0b1020", color: "#f8fafc", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", gap: 12 }}>
          {SPRITES.slice(0, 8).map((s) => (
            <img key={s.id} src={spriteDataUri(s, 6)} width={72} height={72} alt="" />
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 36, letterSpacing: 8, opacity: 0.7 }}>{SITE.name.toUpperCase()}</div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700 }}>{SITE.tagline}</div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 32, opacity: 0.75 }}>Claude Code · Codex · Cursor · MCP · skills: measure your Lift.</div>
        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {TIERS.map(([t, c]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 88, height: 88, borderRadius: 16, background: c, color: "#0b1020", fontSize: 52, fontWeight: 700 }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
