/**
 * Deterministic triage: which bucket (On Fire / Pending / FYI) a thread lands in.
 * The model writes the prose headline; THIS decides urgency — so triage is
 * auditable and never moved by anything hidden in guest data.
 */
import type { Priority, Thread } from "./schema";

// Safety / guest-blocking signals that warrant "act now".
const SAFETY =
  /safe (won'?t|can'?t|not)|passport.*(lock|inside|stuck)|cash.*lock|can'?t leave|catch (a |his |her )?flight|ambulance|collaps|chest pain|bleeding|unconscious|\bflood|\bfire\b|evacuat|gas leak|break-?in|intruder|locked (in|out)/i;
// If the same text says it was handled/declined, it's not on fire anymore.
const MITIGATED =
  /declined|was okay|is okay|stable|no further|attended|mopped|\bdry\b|resolved|sorted/i;

function threadText(t: Thread): string {
  return t.events
    .map(
      (e) =>
        `${e.description} ${e.provenance.format === "freetext" ? e.provenance.sourceSpan : ""}`,
    )
    .join(" ");
}

export function prioritize(t: Thread): Priority {
  // Resolved / informational items are FYI.
  if (!t.open || t.state === "newly_resolved") return "fyi";

  const hasDeadline = t.flags.some((f) => f.kind === "deadline");
  const text = threadText(t);
  const safety = SAFETY.test(text) && !MITIGATED.test(text);

  if (hasDeadline || safety) return "on_fire";
  return "pending";
}
