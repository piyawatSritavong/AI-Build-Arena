"use client";

import { useState } from "react";

export function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="mb-1 text-xs opacity-70">{label}</p>}
      <pre className="overflow-x-auto rounded bg-foreground/5 p-2 pr-16 text-xs">{text}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
        className="absolute right-1.5 bottom-1.5 rounded bg-foreground px-2 py-0.5 text-xs text-background"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
