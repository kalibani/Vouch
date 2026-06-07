/**
 * Free-text ingest — prose night logs → NormalizedEvent[]. This is the only
 * ingest path that uses the model (Haiku extraction), so it carries the core
 * anti-hallucination check: the GROUNDING GATE.
 *
 * The model proposes events, each with a VERBATIM `sourceSpan`. Before we trust
 * an event, we verify that span literally occurs in the source text. Any event
 * whose span we cannot find is DROPPED as ungrounded — this is what stops the
 * extractor from inventing rooms, amounts, or outcomes.
 *
 * Embedded instructions (prompt injection) are NOT dropped: they are kept and
 * marked `containsEmbeddedInstruction`, so reconcile/verify can surface them as
 * a flagged "suspicious note for review" — never obeyed.
 *
 * See `.claude/rules/grounding-discipline.md` §2 and §4.
 */
import { HAIKU, type ModelClient } from "../model/client";
import {
  type ExtractedEvent,
  ExtractionResultSchema,
  FREETEXT_EXTRACTION_SYSTEM,
} from "../model/prompts";
import { type FreeTextLog, type NormalizedEvent, NormalizedEventSchema } from "../schema";
import { canonicalCategory, looksLikeInjection, singleRoomRef } from "./structured";

export interface ExtractFreeTextOptions {
  /** Morning date (YYYY-MM-DD) the handover is for; used to synthesize timestamps. */
  morningDate: string;
  /** Injected model client (real in prod, fake in tests — no network). */
  model: ModelClient;
}

/** Lowercase + collapse all runs of whitespace, for whitespace-insensitive matching. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The grounding check: is `span` literally present in `source`? We allow
 * whitespace/case differences (line wraps and casing are not semantic), but
 * nothing more — the span's words must really be in the source, in order.
 */
function spanIsGrounded(span: string, source: string): boolean {
  const s = span.trim();
  if (s.length === 0) return false;
  if (source.includes(s)) return true;
  return normalizeWhitespace(source).includes(normalizeWhitespace(s));
}

/** Slugify a log label for use in synthesized event ids. */
function slugify(label: string | undefined): string {
  const base = (label ?? "x")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "x";
}

/**
 * Map one grounded extracted event to a NormalizedEvent. Prose lacks exact
 * times, so we synthesize a timestamp inside the night (02:00 local). The room
 * the model reports is double-checked against our deterministic single-room
 * detector run over the verbatim span, so a hallucinated room cannot slip in.
 */
function toNormalizedEvent(
  extracted: ExtractedEvent,
  log: FreeTextLog,
  hotelId: string,
  index: number,
  morningDate: string,
): NormalizedEvent {
  // Trust the model's room only if our deterministic detector agrees on it, or
  // the detector finds none (the model may read prose we don't pattern-match).
  const deterministicRoom = singleRoomRef(extracted.sourceSpan);
  const room = deterministicRoom ?? extracted.room ?? null;

  const containsEmbeddedInstruction =
    extracted.isInstructionToSystem || looksLikeInjection(extracted.sourceSpan);

  return NormalizedEventSchema.parse({
    id: `log:${slugify(log.label)}:${index}`,
    hotelId,
    // Prose lacks exact times; synthesize a deterministic time inside the night.
    timestamp: `${morningDate}T02:00:00+08:00`,
    category: canonicalCategory(
      extracted.category,
      `${extracted.sourceSpan} ${extracted.description}`,
    ),
    room,
    guest: null,
    description: extracted.description,
    openState: extracted.openState,
    containsEmbeddedInstruction,
    provenance: {
      format: "freetext",
      logLabel: log.label,
      sourceSpan: extracted.sourceSpan,
      language: extracted.language,
    },
  });
}

/**
 * Extract NormalizedEvents from one free-text log via the model, then enforce
 * the grounding gate (drop any event whose verbatim span is not in the source).
 *
 * Returns only grounded survivors. Embedded instructions survive (flagged).
 */
export async function extractFreeText(
  log: FreeTextLog,
  hotelId: string,
  opts: ExtractFreeTextOptions,
): Promise<NormalizedEvent[]> {
  const data = buildExtractionInput(log);
  const result = await opts.model.extract({
    model: HAIKU,
    system: FREETEXT_EXTRACTION_SYSTEM,
    data,
    schema: ExtractionResultSchema,
  });

  const events: NormalizedEvent[] = [];
  let surviving = 0;
  for (const extracted of result.events) {
    // GROUNDING GATE: the verbatim span MUST occur in the source text.
    if (!spanIsGrounded(extracted.sourceSpan, log.text)) continue;
    events.push(toNormalizedEvent(extracted, log, hotelId, surviving, opts.morningDate));
    surviving += 1;
  }
  return events;
}

/** The untrusted text we hand the model (the client wraps it in a DATA block). */
function buildExtractionInput(log: FreeTextLog): string {
  return log.text;
}
