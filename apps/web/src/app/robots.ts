import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Endpoints, not pages. /api/og/ stays open so X, Facebook and LINE can fetch share images.
// /me and /login stay crawlable so bots can read their noindex tag (a robots block can still get a URL indexed).
const disallow = ["/api/", "/auth/"];
const allow = ["/", "/api/og/"];

// AI search and answer engines (GEO/AEO): welcome explicitly, same private paths.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow, disallow },
      { userAgent: AI_BOTS, allow, disallow },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: new URL(SITE.url).host,
  };
}
