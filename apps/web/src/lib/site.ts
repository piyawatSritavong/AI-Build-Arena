import type { Metadata } from "next";

export const SITE = {
  name: "SetupTier",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  tagline: "What tier is your AI setup?",
  description:
    "SetupTier measures how much your AI coding setup (Claude Code, Codex, Cursor, MCP servers, skills, hooks) adds over the same client with nothing added: your Lift. Solve output-verified challenges, get a pixel card and climb the Global and Thai leaderboards.",
  keywords: [
    "AI setup",
    "AI coding benchmark",
    "Claude Code",
    "Codex",
    "Cursor",
    "MCP servers",
    "Claude skills",
    "AI agent leaderboard",
    "AI tools trend",
    "MCP config checker",
    "Thai developers",
  ],
  github: "https://github.com/piyawatSritavong/AI-Build-Arena",
} as const;

export const absoluteUrl = (path = "/") => `${SITE.url}${path === "/" ? "" : path}`;

type PageMetaInput = {
  title?: string;
  /** Use as-is (no "· SetupTier" suffix), e.g. the home page. */
  absoluteTitle?: string;
  /** Title for share cards (og/twitter) when it should differ from the browser tab title. */
  shareTitle?: string;
  description?: string;
  path: string;
  images?: { url: string; width?: number; height?: number; alt?: string }[];
  noindex?: boolean;
};

/**
 * Full per-page metadata. Next merges metadata shallowly, so a page that sets `openGraph`
 * replaces the layout's whole object: build every field here instead of relying on inheritance.
 */
export function pageMeta({ title, absoluteTitle, shareTitle, description = SITE.description, path, images, noindex }: PageMetaInput): Metadata {
  const fullTitle = shareTitle ?? absoluteTitle ?? (title ? `${title} · ${SITE.name}` : SITE.name);
  const ogImages = images ?? [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name}: ${SITE.tagline}` }];
  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE.name, locale: "en_US", url: path, title: fullTitle, description, images: ogImages },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: ogImages.map((i) => i.url) },
    robots: noindex
      ? { index: false, follow: true }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  };
}
