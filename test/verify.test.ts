/**
 * The verify grounding gate's rejection path — the adversarial case
 * validation-discipline.md requires ("the grounding verifier must reject an
 * ungrounded claim"). A `/review` pass found the original check used substring
 * matching (an invented "100" was excused by a source "1000"); these lock the
 * token-equality fix. Also a couple of prioritize sanity checks.
 */
import { describe, expect, it } from "vitest";
import { prioritize } from "../lib/prioritize";
import {
  type Flag,
  type HandoverItem,
  NormalizedEventSchema,
  type Thread,
  ThreadSchema,
} from "../lib/schema";
import { verifyHandover } from "../lib/verify";

function srcEvent(p: {
  id: string;
  room: string | null;
  description: string;
  openState?: "open" | "resolved" | "info";
}) {
  return NormalizedEventSchema.parse({
    id: p.id,
    hotelId: "lumen-sg",
    timestamp: "2026-05-30T01:00:00+08:00",
    category: "deposit",
    room: p.room,
    guest: null,
    description: p.description,
    openState: p.openState ?? "open",
    provenance: { format: "structured", sourceEventId: p.id },
  });
}

function thread(p: {
  id: string;
  room: string | null;
  events: ReturnType<typeof srcEvent>[];
  open?: boolean;
  flags?: Flag[];
}): Thread {
  return ThreadSchema.parse({
    id: p.id,
    hotelId: "lumen-sg",
    title: p.room ? `Room ${p.room}` : "Note",
    category: "deposit",
    room: p.room,
    guest: null,
    events: p.events,
    open: p.open ?? true,
    state: "still_open",
    firstShiftId: "2026-05-30",
    lastShiftId: "2026-05-30",
    flags: p.flags ?? [],
  });
}

function item(p: {
  threadId: string;
  room: string | null;
  headline: string;
  sourceEventIds: string[];
}): HandoverItem {
  return {
    id: `item:${p.threadId}`,
    threadId: p.threadId,
    priority: "pending",
    state: "still_open",
    category: "deposit",
    room: p.room,
    guest: null,
    headline: p.headline,
    flags: [],
    sourceEventIds: p.sourceEventIds,
  };
}

describe("verifyHandover grounding gate", () => {
  it("rewrites a headline that invents a room/amount (token equality, not substring)", () => {
    // Source mentions SGD 1000 and room 309 — but NOT room 100 or SGD 100.
    const t = thread({
      id: "room:309",
      room: "309",
      events: [
        srcEvent({
          id: "evt_x",
          room: "309",
          description: "Card declined for the SGD 1000 deposit.",
        }),
      ],
    });
    const invented = item({
      threadId: "room:309",
      room: "309",
      headline: "Charge SGD 100 to room 100 immediately.",
      sourceEventIds: ["evt_x"],
    });

    const { items, report } = verifyHandover([invented], new Map([["room:309", t]]));

    expect(report.grounded).toBe(false);
    expect(report.unsupported[0]?.itemId).toBe("item:room:309");
    expect(items[0]?.headline).not.toContain("100"); // invented number gone
    expect(items[0]?.headline).toContain("309"); // fallback is source-derived
  });

  it("keeps a headline whose numbers/amounts are all present in the sources", () => {
    const t = thread({
      id: "room:309",
      room: "309",
      events: [
        srcEvent({
          id: "evt_x",
          room: "309",
          description: "Card declined for the SGD 1000 deposit.",
        }),
      ],
    });
    const ok = item({
      threadId: "room:309",
      room: "309",
      headline: "Collect the SGD 1000 deposit from room 309.",
      sourceEventIds: ["evt_x"],
    });

    const { items, report } = verifyHandover([ok], new Map([["room:309", t]]));
    expect(report.grounded).toBe(true);
    expect(items[0]?.headline).toBe("Collect the SGD 1000 deposit from room 309.");
  });
});

describe("prioritize", () => {
  const ev = (description: string, openState: "open" | "resolved" = "open") =>
    srcEvent({ id: "e", room: "101", description, openState });

  it("On Fire for a deadline flag or an unmitigated safety issue", () => {
    expect(
      prioritize(
        thread({
          id: "t",
          room: "101",
          events: [ev("immigration backlog")],
          flags: [{ kind: "deadline", detail: "48h", sourceEventIds: ["e"] }],
        }),
      ),
    ).toBe("on_fire");
    expect(
      prioritize(
        thread({
          id: "t",
          room: "208",
          events: [ev("guest's passport locked in the safe, urgent")],
        }),
      ),
    ).toBe("on_fire");
  });

  it("Pending for a mitigated unwell guest; FYI when resolved", () => {
    expect(
      prioritize(
        thread({
          id: "t",
          room: "301",
          events: [ev("guest felt unwell, declined ambulance, said she was okay")],
        }),
      ),
    ).toBe("pending");
    expect(
      prioritize(
        thread({ id: "t", room: "305", open: false, events: [ev("noise resolved", "resolved")] }),
      ),
    ).toBe("fyi");
  });
});
