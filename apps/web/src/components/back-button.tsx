"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "arena-nav-stack";

function readStack(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-50)));
  } catch {
    // storage unavailable (private mode): back falls through to home
  }
}

/**
 * History back within the site; goes home when there is no in-site page to return to
 * (e.g. the page was opened from a shared link). Tracks in-site pages per tab.
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stack = readStack();
    if (stack.at(-1) === pathname) return;
    if (stack.at(-2) === pathname) stack.pop(); // browser/back-button navigation
    else stack.push(pathname);
    writeStack(stack);
  }, [pathname]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => (readStack().length > 1 ? router.back() : router.push("/"))}
    >
      ← ย้อนกลับ
    </button>
  );
}
