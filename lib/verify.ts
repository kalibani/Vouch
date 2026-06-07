/**
 * Grounding gate over generated prose. Every handover item already carries real
 * `sourceEventIds` (attached deterministically), so the linkage is sound by
 * construction. This step checks the PROSE: any number or money amount the model
 * wrote that is NOT present in the thread's sources is treated as ungrounded, and
 * the line is rewritten to a conservative, source-derived headline. Nothing
 * invented reaches the operator; the report records what was caught.
 */
import type { GroundingReport, HandoverItem, Thread } from "./schema";

function sourceText(thread: Thread): string {
  const parts: string[] = [];
  for (const e of thread.events) {
    parts.push(e.description);
    // Room/guest come from structured fields and are grounded even when the prose
    // doesn't repeat them — include them so a thread's own room number is never
    // mistaken for an invented one.
    if (e.room) parts.push(e.room);
    if (e.guest) parts.push(e.guest);
    if (e.provenance.format === "freetext") parts.push(e.provenance.sourceSpan);
  }
  return parts.join(" ").toLowerCase();
}

const NUMBER_TOKEN = /\b\d{2,4}\b/g; // rooms / counts
const AMOUNT_TOKEN = /(?:sgd|usd|\$)\s?(\d[\d,]*)/gi;

/** Numbers/amounts present in `text` but absent from the thread's `source`. */
function unsupportedEntities(text: string, source: string): string[] {
  const sourceDigits = source.replace(/[^\d]/g, " ");
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(NUMBER_TOKEN)) {
    if (!source.includes(m[0])) out.push(`number ${m[0]}`);
  }
  for (const m of lower.matchAll(AMOUNT_TOKEN)) {
    const digits = (m[1] ?? "").replace(/[^\d]/g, "");
    if (digits && !sourceDigits.includes(digits)) out.push(`amount ${m[0]}`);
  }
  return out;
}

/** A fully-grounded headline derived only from thread fields, used to replace any
 * model line that fails the entity check. */
function fallbackHeadline(thread: Thread): string {
  const who = thread.room ? `Room ${thread.room}` : thread.title;
  const ids = thread.events.map((e) => e.id).join(", ");
  return `${who}: ${thread.category.replace(/_/g, " ")} — review source events (${ids}).`;
}

export function verifyHandover(
  items: HandoverItem[],
  threadsById: Map<string, Thread>,
): { items: HandoverItem[]; report: GroundingReport } {
  const unsupported: { itemId: string; reason: string }[] = [];

  const checked = items.map((item) => {
    const thread = threadsById.get(item.threadId);
    if (!thread) {
      unsupported.push({ itemId: item.id, reason: "no source thread" });
      return { ...item, detail: undefined };
    }
    const text = `${item.headline} ${item.detail ?? ""}`;
    const bad = unsupportedEntities(text, sourceText(thread));
    if (bad.length > 0) {
      unsupported.push({ itemId: item.id, reason: bad.join("; ") });
      return { ...item, headline: fallbackHeadline(thread), detail: undefined };
    }
    return item;
  });

  return {
    items: checked,
    report: { grounded: unsupported.length === 0, itemCount: items.length, unsupported },
  };
}
