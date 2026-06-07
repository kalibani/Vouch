/**
 * Regression guards for bugs the `reviewer` subagent found in the deterministic
 * core that the sample data did not exercise. Each of these failed before the fix.
 */
import { describe, expect, it } from "vitest";
import { singleRoomRef } from "../lib/ingest/structured";
import { reconcile } from "../lib/reconcile";
import { type NormalizedEvent, NormalizedEventSchema, type Thread } from "../lib/schema";

function ev(p: {
  id: string;
  room: string;
  category: string;
  openState: "open" | "resolved";
  ts: string;
}): NormalizedEvent {
  return NormalizedEventSchema.parse({
    id: p.id,
    hotelId: "lumen-sg",
    timestamp: p.ts,
    category: p.category,
    room: p.room,
    guest: null,
    description: `${p.category} in ${p.room}`,
    openState: p.openState,
    provenance: { format: "structured", sourceEventId: p.id },
  });
}

function find(threads: Thread[], id: string): Thread {
  const t = threads.find((x) => x.id === id);
  if (!t) throw new Error(`thread ${id} not found`);
  return t;
}

describe("reviewer guard: same-room multi-issue collapse", () => {
  it("keeps a room open when one issue resolves but another is still open", () => {
    const { threads } = reconcile(
      [
        ev({
          id: "a",
          room: "401",
          category: "maintenance",
          openState: "open",
          ts: "2026-05-30T01:00:00+08:00",
        }),
        ev({
          id: "b",
          room: "401",
          category: "lost_keycard",
          openState: "resolved",
          ts: "2026-05-30T02:00:00+08:00",
        }),
      ],
      "2026-05-30",
    );
    // The resolved keycard must NOT mask the still-open maintenance issue.
    expect(find(threads, "room:401").open).toBe(true);
  });
});

describe("reviewer guard: ordering by true instant, not ISO string", () => {
  it("resolves correctly when a later instant carries a smaller wall-clock string", () => {
    const { threads } = reconcile(
      [
        // 03:00+08:00 == 2026-05-29T19:00Z (earlier instant)
        ev({
          id: "open",
          room: "402",
          category: "maintenance",
          openState: "open",
          ts: "2026-05-30T03:00:00+08:00",
        }),
        // 02:00+00:00 == 2026-05-30T02:00Z (LATER instant, smaller ISO string)
        ev({
          id: "res",
          room: "402",
          category: "maintenance",
          openState: "resolved",
          ts: "2026-05-30T02:00:00+00:00",
        }),
      ],
      "2026-05-30",
    );
    // True order is open → resolved, so the thread is closed.
    expect(find(threads, "room:402").open).toBe(false);
  });
});

describe("reviewer guard: singleRoomRef on realistic formats", () => {
  it("reads labelled rooms beyond 3 digits and ignores stray amounts", () => {
    expect(singleRoomRef("Guest moved to Room 1024.")).toBe("1024");
    expect(singleRoomRef("Cracked basin — charge SGD 500 to room 226.")).toBe("226");
  });
  it("still refuses to guess across several rooms", () => {
    expect(singleRoomRef("passports for rooms 207, 210, 211 unscanned")).toBeNull();
  });
});
