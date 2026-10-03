import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { readTrendStats } from "@/app/trend/result/stats";

export function GET(request: NextRequest) {
  const s = readTrendStats(Object.fromEntries(request.nextUrl.searchParams));
  const tiles: [string, string, string][] = [
    ["Proven", `${s.proven}/${s.provenTotal}`, "#34d399"],
    ["Hype", String(s.hype), "#fbbf24"],
    ["Fading", String(s.fading), "#94a3b8"],
    ["Gems", String(s.gems), "#38bdf8"],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0b1020", color: "#f8fafc", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.7 }}>SetupTier · Trend Check</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 10 }}>
          <div style={{ display: "flex", fontSize: 180, fontWeight: 700, lineHeight: 1 }}>{s.sync}%</div>
          <div style={{ display: "flex", fontSize: 40, paddingBottom: 24, opacity: 0.8 }}>Meta Sync</div>
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 50 }}>
          {tiles.map(([k, v, c]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", padding: "18px 30px", borderRadius: 18, background: "#1e2540", borderTop: `6px solid ${c}` }}>
              <div style={{ display: "flex", fontSize: 26, opacity: 0.65 }}>{k}</div>
              <div style={{ display: "flex", fontSize: 54, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 50, opacity: 0.7 }}>Carrying too much? Check yours in 60 seconds.</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
