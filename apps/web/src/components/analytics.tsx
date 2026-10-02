"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
let ready = false;

/** Cookieless, no session recording, no input capture. No-op unless NEXT_PUBLIC_POSTHOG_KEY is set. */
export function Analytics() {
  useEffect(() => {
    if (!KEY || ready) return;
    posthog.init(KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      persistence: "memory",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: true,
    });
    ready = true;
  }, []);
  return null;
}

export function capture(event: string, props?: Record<string, string | number | boolean>) {
  if (ready) posthog.capture(event, props);
}
