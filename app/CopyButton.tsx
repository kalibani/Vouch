"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Small copy-to-clipboard control, positioned top-right over a code block.
 * Swaps to a checkmark for ~1.5s on success. No-ops silently if the clipboard
 * API is unavailable (e.g. an insecure context).
 */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; nothing to do
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      style={{
        position: "absolute",
        top: "0.6rem",
        right: "0.6rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: copied ? "var(--resolved, #15803d)" : "rgba(255,255,255,0.1)",
        color: "#e6edf3",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: "0.4rem",
        padding: "0.3rem 0.55rem",
        fontSize: "0.72rem",
        fontWeight: 600,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}
