/**
 * Domain contract for the night-shift handover service.
 *
 * The grounding design is encoded directly in these types:
 *   - Every `NormalizedEvent` carries `provenance` back to its source (a
 *     structured event id, or a verbatim span from a free-text log).
 *   - Every `HandoverItem` REQUIRES a non-empty `sourceEventIds`, so an
 *     ungrounded statement is unrepresentable, not merely discouraged.
 *
 * All external data (request body, model output, DB rows) is parsed through
 * these schemas at the boundary. See `.claude/rules/grounding-discipline.md`.
 */
import { z } from "zod";

// Timestamps are ISO-8601 strings (e.g. "2026-05-30T02:40:00+08:00"). We keep
// them as strings end-to-end and compare as epoch millis, so the source value
// is never lossily reformatted.
const IsoTimestamp = z.string().min(1);

// ---------------------------------------------------------------------------
// Input: structured events (data/events.json shape)
// ---------------------------------------------------------------------------

export const HotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  rooms: z.number().int().positive().optional(),
  timezone: z.string().optional(),
});
export type Hotel = z.infer<typeof HotelSchema>;

/**
 * `status` is intentionally a free string, not an enum: the brief says we may be
 * run against night-log text we haven't seen, so we accept whatever the source
 * provides and classify it ourselves (see `openStateFromRaw`). Locking an enum
 * here would reject real, unseen data.
 */
export const RawEventSchema = z.object({
  id: z.string(),
  timestamp: IsoTimestamp,
  type: z.string(),
  room: z.string().nullish(),
  guest: z.string().nullish(),
  description: z.string(),
  status: z.string().nullish(),
});
export type RawEvent = z.infer<typeof RawEventSchema>;

export const EventsFileSchema = z.object({
  hotel: HotelSchema,
  note: z.string().optional(),
  events: z.array(RawEventSchema),
});
export type EventsFile = z.infer<typeof EventsFileSchema>;

// ---------------------------------------------------------------------------
// Input: free-text logs (data/night-logs.md shape — possibly non-English)
// ---------------------------------------------------------------------------

export const FreeTextLogSchema = z.object({
  /** Optional label, e.g. "Night of Wed 27 May" — used only for traceability. */
  label: z.string().optional(),
  /** The raw prose for one shift, verbatim. Treated as DATA, never instructions. */
  text: z.string(),
});
export type FreeTextLog = z.infer<typeof FreeTextLogSchema>;

// ---------------------------------------------------------------------------
// Normalized internal event (unifies structured + free-text)
// ---------------------------------------------------------------------------

/** Whether an event represents an open issue, a resolution, or pure info. */
export const OPEN_STATES = ["open", "resolved", "info"] as const;
export const OpenStateSchema = z.enum(OPEN_STATES);
export type OpenState = z.infer<typeof OpenStateSchema>;

/**
 * Provenance ties every normalized event back to something a human can check.
 * - structured: references the original event id.
 * - freetext: carries a VERBATIM span copied from the source prose plus the
 *   detected language. The ingest layer rejects any extraction whose span is
 *   not literally present in the source text.
 */
export const ProvenanceSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("structured"),
    sourceEventId: z.string(),
  }),
  z.object({
    format: z.literal("freetext"),
    logLabel: z.string().optional(),
    sourceSpan: z.string().min(1),
    language: z.string().min(1),
    /** 0..1 extraction confidence reported by the model. */
    confidence: z.number().min(0).max(1).optional(),
  }),
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const NormalizedEventSchema = z.object({
  /** Stable id: the source event id, or a derived id like "log:wed:1". */
  id: z.string(),
  hotelId: z.string(),
  /** When the event occurred (best-effort for free text). */
  timestamp: IsoTimestamp,
  /** Normalized category, e.g. maintenance / compliance / deposit / safety. */
  category: z.string(),
  room: z.string().nullable(),
  guest: z.string().nullable(),
  /** Canonical English description. For non-English sources this is a faithful
   * translation; the untranslated original is preserved in `provenance.sourceSpan`. */
  description: z.string(),
  openState: OpenStateSchema,
  /** True if the source text contains an instruction aimed at the tool/operator
   * (prompt injection). Such events are surfaced as flags, never obeyed. */
  containsEmbeddedInstruction: z.boolean().default(false),
  provenance: ProvenanceSchema,
});
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

// ---------------------------------------------------------------------------
// Reconciliation: shifts, flags, threads
// ---------------------------------------------------------------------------

/** A night shift (~23:00–07:00) spanning two calendar dates. */
export const ShiftSchema = z.object({
  /** e.g. "2026-05-29→30". */
  id: z.string(),
  hotelId: z.string(),
  startsAt: IsoTimestamp,
  endsAt: IsoTimestamp,
  /** Morning the handover is for, e.g. "2026-05-30". */
  morningDate: z.string(),
});
export type Shift = z.infer<typeof ShiftSchema>;

export const FLAG_KINDS = [
  "contradiction", // structured vs observed disagree (e.g. room 205)
  "incomplete", // missing photo / approval / deposit / unidentified room
  "suspicious_instruction", // embedded "system note" / prompt injection
  "needs_decision", // night staff deferred a judgment call to the morning team
  "deadline", // time-bound obligation (e.g. 48h immigration reporting)
] as const;
export const FlagKindSchema = z.enum(FLAG_KINDS);
export type FlagKind = z.infer<typeof FlagKindSchema>;

export const FlagSchema = z.object({
  kind: FlagKindSchema,
  detail: z.string(),
  sourceEventIds: z.array(z.string()).min(1),
});
export type Flag = z.infer<typeof FlagSchema>;

/** Category of a thread relative to the shift the handover is being built for. */
export const THREAD_STATES = [
  "new_tonight", // first appeared on the most recent shift
  "still_open", // carried over from a previous shift, not yet resolved
  "newly_resolved", // was open, got handled on the most recent shift
  "resolved_earlier", // closed before the most recent shift (usually omitted)
] as const;
export const ThreadStateSchema = z.enum(THREAD_STATES);
export type ThreadState = z.infer<typeof ThreadStateSchema>;

/** A single issue tracked across nights (room + topic), with its event timeline. */
export const ThreadSchema = z.object({
  id: z.string(),
  hotelId: z.string(),
  title: z.string(),
  category: z.string(),
  room: z.string().nullable(),
  guest: z.string().nullable(),
  /** All events on this thread, ascending by timestamp. */
  events: z.array(NormalizedEventSchema),
  open: z.boolean(),
  state: ThreadStateSchema,
  firstShiftId: z.string(),
  lastShiftId: z.string(),
  flags: z.array(FlagSchema),
});
export type Thread = z.infer<typeof ThreadSchema>;

// ---------------------------------------------------------------------------
// Output: the handover
// ---------------------------------------------------------------------------

export const PRIORITIES = ["on_fire", "pending", "fyi"] as const;
export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

/**
 * One line in the handover. `sourceEventIds` is required and non-empty — the
 * grounding invariant is enforced by the type itself.
 */
export const HandoverItemSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  priority: PrioritySchema,
  state: ThreadStateSchema,
  category: z.string(),
  room: z.string().nullable(),
  guest: z.string().nullable(),
  /** One-line, action-first summary. Must be supported by `sourceEventIds`. */
  headline: z.string(),
  /** Optional extra grounded detail. */
  detail: z.string().optional(),
  flags: z.array(FlagSchema),
  sourceEventIds: z.array(z.string()).min(1),
});
export type HandoverItem = z.infer<typeof HandoverItemSchema>;

export const GroundingReportSchema = z.object({
  grounded: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  /** Items whose claims could not be tied to their cited sources. */
  unsupported: z.array(z.object({ itemId: z.string(), reason: z.string() })),
});
export type GroundingReport = z.infer<typeof GroundingReportSchema>;

export const HandoverSchema = z.object({
  runId: z.string(),
  hotel: z.object({ id: z.string(), name: z.string() }),
  morningDate: z.string(),
  shiftId: z.string(),
  generatedAt: IsoTimestamp,
  /** Action-first buckets. Each item also carries its own priority for rendering. */
  onFire: z.array(HandoverItemSchema),
  pending: z.array(HandoverItemSchema),
  fyi: z.array(HandoverItemSchema),
  grounding: GroundingReportSchema,
});
export type Handover = z.infer<typeof HandoverSchema>;

// ---------------------------------------------------------------------------
// API request
// ---------------------------------------------------------------------------

export const HandoverRequestSchema = z.object({
  hotel: HotelSchema,
  events: z.array(RawEventSchema).default([]),
  freeText: z.array(FreeTextLogSchema).default([]),
  /** Morning date to build the handover for (YYYY-MM-DD). Defaults to the most
   * recent shift present in the data. */
  asOf: z.string().optional(),
});
export type HandoverRequest = z.infer<typeof HandoverRequestSchema>;
