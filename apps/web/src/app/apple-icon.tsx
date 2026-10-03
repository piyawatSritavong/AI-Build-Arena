import { ImageResponse } from "next/og";
import { getSprite, spriteDataUri } from "@arena/core";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1020" }}>
        <img src={spriteDataUri(getSprite("starter-1"), 12)} width={144} height={144} alt="" />
      </div>
    ),
    size,
  );
}
