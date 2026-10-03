import { ImageResponse } from "next/og";
import { getSprite, spriteDataUri } from "@arena/core";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1020", borderRadius: 6 }}>
        <img src={spriteDataUri(getSprite("starter-1"), 2)} width={24} height={24} alt="" />
      </div>
    ),
    size,
  );
}
