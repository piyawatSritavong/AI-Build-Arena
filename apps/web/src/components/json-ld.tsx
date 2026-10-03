/** Structured data (schema.org) for search engines and AI answer engines. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Escape "<" so user-provided strings (display names) can't close the script tag.
  const json = JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
