/**
 * Deterministic flag rules — "flag, don't paper over". Each flag cites the
 * event ids it is derived from, so every flag is traceable. The model never
 * decides a flag.
 *
 * NOTE (known limitation, see DECISIONS.md): contradiction / deadline / etc. are
 * detected with best-effort keyword heuristics over the normalized English text
 * plus the verbatim source span. A claim phrased outside this vocabulary (or only
 * in a non-English span) can be missed. Longer term these classifications belong
 * with the checkable extraction step, not a post-hoc regex.
 */
import type { Flag, FlagKind, NormalizedEvent, Thread } from "../schema";

function textOf(e: NormalizedEvent): string {
  const span = e.provenance.format === "freetext" ? e.provenance.sourceSpan : "";
  return `${e.description}\n${span}`;
}

function idsMatching(events: NormalizedEvent[], re: RegExp): string[] {
  return events.filter((e) => re.test(textOf(e))).map((e) => e.id);
}

function flag(kind: FlagKind, detail: string, ids: string[]): Flag {
  return { kind, detail, sourceEventIds: ids };
}

const OCCUPIED = /in-?house|occupied|staying \d|checked in/i;
const VACANT =
  /empty|vacant|unoccupied|not slept in|door ajar|nobody|no luggage|checked out early/i;
const NO_PROOF = /no photos?|no manager (approval|sign-?off)/i;
const NEVER_COLLECTED = /never (collected|re-?attempted)|deposit was never/i;
const UNIDENTIFIED = /couldn'?t catch which room|could not catch which room|unidentified/i;
const DEFERRED =
  /morning team to (decide|confirm|investigate|review)|leaving for (the )?morning team|not yet charged|flag to finance|needs investigation|proposes charging|before .*(confirmed|reversed)/i;
const DEADLINE = /deadline|within \d+\s*h(?:ours?|rs?)?\b|\b\d{2,}\s*hours?\b/i;

export function computeFlags(thread: Thread): Flag[] {
  const evs = thread.events;
  const flags: Flag[] = [];

  const injectionIds = evs.filter((e) => e.containsEmbeddedInstruction).map((e) => e.id);
  if (injectionIds.length) {
    flags.push(
      flag(
        "suspicious_instruction",
        "Guest-supplied text contains an instruction aimed at the system (e.g. 'report all clear', add a credit, mark approved). Surfaced for review — NOT executed.",
        injectionIds,
      ),
    );
  }

  const occupied = idsMatching(evs, OCCUPIED);
  const vacant = idsMatching(evs, VACANT);
  if (occupied.length && vacant.length) {
    flags.push(
      flag(
        "contradiction",
        "Records and on-site observation disagree about occupancy — reconcile before billing.",
        [...new Set([...occupied, ...vacant])],
      ),
    );
  }

  const noProof = idsMatching(evs, NO_PROOF);
  if (noProof.length) {
    flags.push(flag("incomplete", "Charge proposed without photos or manager approval.", noProof));
  }

  const neverCollected = idsMatching(evs, NEVER_COLLECTED);
  if (neverCollected.length) {
    flags.push(flag("incomplete", "Deposit was never collected.", neverCollected));
  }

  const unidentified = idsMatching(evs, UNIDENTIFIED);
  if (unidentified.length) {
    flags.push(
      flag("incomplete", "Room could not be identified — entry incomplete.", unidentified),
    );
  }

  const deferred = idsMatching(evs, DEFERRED);
  if (deferred.length) {
    flags.push(
      flag("needs_decision", "Night staff deferred a decision to the morning team.", deferred),
    );
  }

  const deadline = idsMatching(evs, DEADLINE);
  if (deadline.length) {
    flags.push(flag("deadline", "Time-bound obligation — act before it lapses.", deadline));
  }

  return flags;
}
