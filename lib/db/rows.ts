/**
 * DB row schemas + mappers.
 *
 * Rows crossing the DB trust boundary are parsed with Zod before use, the same
 * way request bodies and model output are. We validate the *shape* of a row and
 * then map it into the domain `NormalizedEvent` — re-validating `provenance` and
 * `openState` through the domain schema so a malformed value in the DB can never
 * slip into reconciliation or generation.
 */
import { z } from "zod";
import {
  type NormalizedEvent,
  NormalizedEventSchema,
  OpenStateSchema,
  ProvenanceSchema,
} from "../schema";

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

/** The row shape returned by `select` from `events`. */
export const EventRowSchema = z.object({
  id: z.string(),
  hotel_id: z.string(),
  occurred_at: z.string(),
  category: z.string(),
  room: z.string().nullable(),
  guest: z.string().nullable(),
  description: z.string(),
  open_state: OpenStateSchema,
  contains_embedded_instruction: z.boolean(),
  // jsonb comes back already parsed by supabase-js; re-validate it as provenance.
  provenance: ProvenanceSchema,
});
export type EventRow = z.infer<typeof EventRowSchema>;

/** The row shape we INSERT/UPSERT into `events`. */
export interface EventInsert {
  id: string;
  hotel_id: string;
  occurred_at: string;
  category: string;
  room: string | null;
  guest: string | null;
  description: string;
  open_state: NormalizedEvent["openState"];
  contains_embedded_instruction: boolean;
  provenance: NormalizedEvent["provenance"];
}

/** NormalizedEvent → event row for upsert. */
export function eventToRow(hotelId: string, e: NormalizedEvent): EventInsert {
  return {
    id: e.id,
    hotel_id: hotelId,
    occurred_at: e.timestamp,
    category: e.category,
    room: e.room,
    guest: e.guest,
    description: e.description,
    open_state: e.openState,
    contains_embedded_instruction: e.containsEmbeddedInstruction,
    provenance: e.provenance,
  };
}

/**
 * event row → NormalizedEvent. The unknown DB row is first parsed by
 * `EventRowSchema`, then re-parsed through `NormalizedEventSchema` so the value
 * handed to the rest of the pipeline is provably a valid domain object.
 */
export function rowToEvent(raw: unknown): NormalizedEvent {
  const row = EventRowSchema.parse(raw);
  return NormalizedEventSchema.parse({
    id: row.id,
    hotelId: row.hotel_id,
    timestamp: row.occurred_at,
    category: row.category,
    room: row.room,
    guest: row.guest,
    description: row.description,
    openState: row.open_state,
    containsEmbeddedInstruction: row.contains_embedded_instruction,
    provenance: row.provenance,
  });
}

// ---------------------------------------------------------------------------
// handover_runs
// ---------------------------------------------------------------------------

/**
 * The audit record we INSERT into `handover_runs`. `handover`, `grounding`, and
 * `model_usage` are stored as jsonb. `handover` and `grounding` are typed
 * loosely here (the pipeline owns their precise shape via lib/schema) but are
 * required where the column is `not null`.
 */
export interface HandoverRunInsert {
  hotel_id: string;
  morning_date: string | null;
  shift_id: string | null;
  as_of: string | null;
  generated_at: string | null;
  handover: unknown;
  grounding?: unknown;
  model_usage?: unknown;
}
