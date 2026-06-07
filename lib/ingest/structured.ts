/**
 * Structured ingest — RawEvent[] → NormalizedEvent[]. Pure and model-free:
 * structured events are already machine-readable, so normalization is
 * deterministic and fully testable. (Free-text ingest, which needs the model,
 * lives in `freetext.ts` but produces the same NormalizedEvent shape.)
 */
import { type NormalizedEvent, NormalizedEventSchema, type RawEvent } from "../schema";

// A room explicitly labelled "room/rm/no 1024" (2–4 digits, optional letter).
const ROOM_LABELLED = /\b(?:room|rm|no\.?)\s*#?\s*(\d{2,4}[A-Za-z]?)\b/gi;
// Fallback: a bare 3-digit token (covers logs that just write "215").
const ROOM_BARE = /\b(\d{3})\b/g;

function only<T>(set: Set<T>): T | null {
  if (set.size !== 1) return null;
  return set.values().next().value ?? null;
}

/**
 * Extract a room only when it is UNAMBIGUOUS — exactly one distinct room is
 * named. Multi-room notes ("rooms 207, 210, 211") and stray amounts ("SGD 500")
 * must not be misfiled. Labelled rooms win over bare digits.
 */
export function singleRoomRef(text: string): string | null {
  const labelled = new Set<string>();
  for (const m of text.matchAll(ROOM_LABELLED)) if (m[1]) labelled.add(m[1]);
  if (labelled.size >= 1) return only(labelled);

  const bare = new Set<string>();
  for (const m of text.matchAll(ROOM_BARE)) if (m[1]) bare.add(m[1]);
  return only(bare);
}

const INJECTION_RE =
  /\bignore (all|other|the other)\b|report .*all clear|system note to|mark it approved|\bgoodwill credit\b|add (a |an )?sgd/i;

/** Heuristic: does this text contain an instruction aimed at the tool/operator?
 * Used to FLAG (never obey) prompt-injection attempts hidden in guest data. */
export function looksLikeInjection(text: string): boolean {
  return INJECTION_RE.test(text);
}

// Deliberately does NOT match a bare "passport": that word also appears in ID
// verification (e.g. a booking-name mismatch checked against a passport), which
// is a different issue from the immigration-reporting backlog.
const IMMIGRATION_RE = /immigration|reporting system|reporting deadline|not scanned/i;

/** Map a raw event type + description to a normalized category bucket. */
export function categoryOf(type: string, description: string): string {
  const t = type.toLowerCase();
  if (t === "compliance" || IMMIGRATION_RE.test(description)) return "compliance";
  if (t.includes("deposit")) return "deposit";
  if (t.includes("maintenance")) return "maintenance";
  if (t.includes("damage")) return "damage";
  if (t.includes("complaint")) return "complaint";
  if (t.includes("no_show")) return "no_show";
  if (t.includes("facilities")) return "facilities";
  if (t.includes("incident")) return "incident";
  if (t.includes("check_in")) return "check_in";
  if (t.includes("guest_message")) return "guest_message";
  if (t.includes("finance")) return "finance_note";
  if (t.includes("walk_in")) return "walk_in";
  if (t.includes("keycard")) return "lost_keycard";
  if (t.includes("early_checkout")) return "early_checkout";
  return t || "note";
}

/** Categories whose "resolved" events are pure FYI (a smooth check-in, a held
 * parcel) rather than the closing of a problem. */
const INFO_CATEGORIES = new Set(["check_in", "note", "finance_note", "walk_in"]);

export function openStateOf(
  status: string | null | undefined,
  category: string,
): "open" | "resolved" | "info" {
  const s = (status ?? "").toLowerCase();
  if (s === "resolved") return INFO_CATEGORIES.has(category) ? "info" : "resolved";
  if (s === "unresolved" || s === "pending") return "open";
  // Unknown/missing status: default to OPEN. For a handover, surfacing a possibly
  // open item is safer than silently treating it as closed.
  return "open";
}

export function normalizeStructured(events: RawEvent[], hotelId: string): NormalizedEvent[] {
  return events.map((e) => {
    const category = categoryOf(e.type, e.description);
    const room = e.room ?? singleRoomRef(e.description);
    return NormalizedEventSchema.parse({
      id: e.id,
      hotelId,
      timestamp: e.timestamp,
      category,
      room: room ?? null,
      guest: e.guest ?? null,
      description: e.description,
      openState: openStateOf(e.status, category),
      containsEmbeddedInstruction: looksLikeInjection(e.description),
      provenance: { format: "structured", sourceEventId: e.id },
    });
  });
}
