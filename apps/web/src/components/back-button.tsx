"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { btnBack } from "./ui";

const KEY = "arena-nav-stack";

function readStack(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Mounted once in the root layout: remembers in-site pages per tab so Back can tell where the user came from. */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const stack = readStack();
    if (stack.at(-1) === pathname) return;
    if (stack.at(-2) === pathname) stack.pop();
    else stack.push(pathname);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-50)));
    } catch {
      // storage unavailable: BackButton falls back to its href
    }
  }, [pathname]);
  return null;
}

/** Fixed destination, labelled with where it goes (predictable). */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={btnBack}>
      ← {label}
    </Link>
  );
}

/** For pages reachable from several places (card, login): previous in-site page, else the fallback. */
export function BackButton({ fallbackHref, label = "Back" }: { fallbackHref: string; label?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={btnBack} onClick={() => (readStack().length > 1 ? router.back() : router.push(fallbackHref))}>
      ← {label}
    </button>
  );
}
