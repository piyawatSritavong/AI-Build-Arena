import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@/components/analytics";
import { NavTracker } from "@/components/back-button";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  category: "technology",
  openGraph: { type: "website", siteName: SITE.name, locale: "en_US", title: `${SITE.name}: ${SITE.tagline}`, description: SITE.description },
  twitter: { card: "summary_large_image", title: `${SITE.name}: ${SITE.tagline}`, description: SITE.description },
  formatDetection: { telephone: false, email: false, address: false },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd
          data={{
            "@graph": [
              { "@type": "Organization", "@id": `${SITE.url}/#org`, name: SITE.name, url: SITE.url, logo: `${SITE.url}/apple-icon`, sameAs: [SITE.github] },
              { "@type": "WebSite", "@id": `${SITE.url}/#website`, name: SITE.name, url: SITE.url, description: SITE.description, inLanguage: "en", publisher: { "@id": `${SITE.url}/#org` } },
            ],
          }}
        />
        {children}
        <NavTracker />
        <Analytics />
      </body>
    </html>
  );
}
