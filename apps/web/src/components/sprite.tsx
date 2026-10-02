import { getSprite, spriteSvg } from "@arena/core";

/** Inline pixel sprite. SVG comes from static preset data, never user input. */
export function SpriteView({ id, px = 10, className }: { id: string | null | undefined; px?: number; className?: string }) {
  return <span className={className} aria-hidden dangerouslySetInnerHTML={{ __html: spriteSvg(getSprite(id), px) }} />;
}
