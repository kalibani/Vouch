/**
 * Repository — the only module that talks to Supabase tables.
 *
 * Boundary discipline:
 *   - Inputs are domain objects (NormalizedEvent, Hotel); rows read back are
 *     Zod-validated via lib/db/rows before re-entering the pipeline.
 *   - Errors are NEVER swallowed: every Supabase error is rethrown with context
 *     (operation + hotelId) so the caller can log it with runId/stage. This
 *     module does not import the logger (owned elsewhere) — it surfaces, the
 *     caller records.
 */
import type { Hotel, NormalizedEvent } from "../schema";
import { getDb } from "./client";
import { eventToRow, type HandoverRunInsert, rowToEvent } from "./rows";

/** Wrap a Supabase error into an explicit, contextual Error. */
function fail(operation: string, hotelId: string, message: string): never {
  throw new Error(`db.${operation} failed for hotel "${hotelId}": ${message}`);
}

/**
 * Upsert the hotel registry row. Idempotent on the primary key, so registering
 * an already-known hotel is a no-op update.
 */
export async function ensureHotel(hotel: Hotel): Promise<void> {
  const { error } = await getDb()
    .from("hotels")
    .upsert(
      { id: hotel.id, name: hotel.name, timezone: hotel.timezone ?? null },
      { onConflict: "id" },
    );
  if (error) fail("ensureHotel", hotel.id, error.message);
}

/**
 * Upsert normalized events on the composite key (hotel_id, id). Re-ingesting the
 * same source events is therefore idempotent — no duplicates. A no-op for an
 * empty list.
 */
export async function upsertEvents(hotelId: string, events: NormalizedEvent[]): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => eventToRow(hotelId, e));
  const { error } = await getDb().from("events").upsert(rows, { onConflict: "hotel_id,id" });
  if (error) fail("upsertEvents", hotelId, error.message);
}

/**
 * Fetch a hotel's full normalized event history, ascending by occurrence. Each
 * row is validated through the domain schema, so reconciliation only ever sees
 * provably-valid events.
 */
export async function getEvents(hotelId: string): Promise<NormalizedEvent[]> {
  const { data, error } = await getDb()
    .from("events")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("occurred_at", { ascending: true });
  if (error) fail("getEvents", hotelId, error.message);
  // `data` is `null` on no rows when error is absent; treat as empty.
  return (data ?? []).map(rowToEvent);
}

/**
 * Insert one immutable audit row capturing a full pipeline run. Never updates an
 * existing run — each run is its own record.
 */
export async function saveHandoverRun(record: HandoverRunInsert): Promise<void> {
  const { error } = await getDb().from("handover_runs").insert(record);
  if (error) fail("saveHandoverRun", record.hotel_id, error.message);
}
