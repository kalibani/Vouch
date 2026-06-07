import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeStructured } from "../lib/ingest/structured";
import { reconcile, visibleThreads } from "../lib/reconcile";
import {
  EventsFileSchema,
  type NormalizedEvent,
  NormalizedEventSchema,
  type Thread,
} from "../lib/schema";

/**
 * Free-text events the Wed-27→28 relief log would yield once extracted by Haiku.
 * Hand-authored here so the deterministic reconciliation can be tested without a
 * live model — they carry the same provenance (verbatim span + language) the real
 * extractor must produce.
 */
function ft(p: {
  id: string;
  timestamp: string;
  category: string;
  room: string | null;
  description: string;
  openState: "open" | "resolved" | "info";
  span: string;
  language: string;
}): NormalizedEvent {
  return NormalizedEventSchema.parse({
    id: p.id,
    hotelId: "lumen-sg",
    timestamp: p.timestamp,
    category: p.category,
    room: p.room,
    guest: null,
    description: p.description,
    openState: p.openState,
    provenance: {
      format: "freetext",
      logLabel: "Night of Wed 27 May",
      sourceSpan: p.span,
      language: p.language,
    },
  });
}

const wedLog: NormalizedEvent[] = [
  ft({
    id: "log:wed:112",
    timestamp: "2026-05-28T01:00:00+08:00",
    category: "maintenance",
    room: "112",
    description:
      "Maintenance inspected room 112 aircon: it's the compressor, the part must be ordered (a few days). Room stays out of order.",
    openState: "open",
    span: "it's the compressor and the part needs to be ordered in, will take a few days",
    language: "en",
  }),
  ft({
    id: "log:wed:205",
    timestamp: "2026-05-28T03:00:00+08:00",
    category: "complaint",
    room: "205",
    description:
      "On 2nd-floor rounds, room 205 door ajar, bed not slept in, no luggage. System still shows the guest in-house. Possible unrecorded early checkout.",
    openState: "open",
    span: "205 had the door ajar, bed clearly not slept in, no luggage anywhere in the room",
    language: "en",
  }),
  ft({
    id: "log:wed:312",
    timestamp: "2026-05-28T02:00:00+08:00",
    category: "no_show",
    room: "312",
    description: "Charged the 312 no-show one night per booking terms; considered settled.",
    openState: "resolved",
    span: "我已经按 booking terms 帮他收了一晚的费用了，这件事 settle 了",
    language: "zh",
  }),
  ft({
    id: "log:wed:208",
    timestamp: "2026-05-28T03:30:00+08:00",
    category: "incident",
    room: "208",
    description:
      "Room 208 safe won't open; guest's passport and cash locked inside; guest checking out early for a flight. Reset failed — need a locksmith / safe vendor urgently.",
    openState: "open",
    span: "208 房的客人刚才下来说房间的保险箱打不开了，他的护照和一些现金锁在里面",
    language: "zh",
  }),
  ft({
    id: "log:wed:309",
    timestamp: "2026-05-28T02:30:00+08:00",
    category: "deposit",
    room: "309",
    description: "309 deposit still not settled; guest came in very late, not chased.",
    openState: "open",
    span: "309 — the guy with the deposit issue from Tuesday is still not settled",
    language: "en",
  }),
];

function load(): NormalizedEvent[] {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "events.json"), "utf8"));
  const file = EventsFileSchema.parse(raw);
  return normalizeStructured(file.events, file.hotel.id);
}

function find(threads: Thread[], id: string): Thread {
  const t = threads.find((x) => x.id === id);
  if (!t) throw new Error(`thread ${id} not found (have: ${threads.map((x) => x.id).join(", ")})`);
  return t;
}
const hasFlag = (t: Thread, kind: string) => t.flags.some((f) => f.kind === kind);

describe("reconciliation across the full week (asOf = 2026-05-30)", () => {
  let threads: Thread[];
  beforeAll(() => {
    threads = reconcile([...load(), ...wedLog], "2026-05-30").threads;
  });

  it("accumulates the immigration backlog across nights, with a deadline", () => {
    const t = find(threads, "topic:immigration");
    expect(t.state).toBe("still_open");
    expect(t.events.map((e) => e.id)).toEqual(["evt_0003", "evt_0009", "evt_0019"]);
    expect(hasFlag(t, "deadline")).toBe(true);
  });

  it("carries the room-112 aircon thread across the whole week", () => {
    const t = find(threads, "room:112");
    expect(t.state).toBe("still_open");
    expect(t.firstShiftId).toBe("2026-05-26");
    expect(t.lastShiftId).toBe("2026-05-30");
    expect(t.events.map((e) => e.id)).toContain("log:wed:112");
  });

  it("flags the room-205 contradiction (system in-house vs observed empty)", () => {
    const t = find(threads, "room:205");
    expect(hasFlag(t, "contradiction")).toBe(true);
    expect(t.open).toBe(true);
    const contradiction = t.flags.find((f) => f.kind === "contradiction");
    // cites BOTH the structured check-in and the free-text observation
    expect(contradiction?.sourceEventIds).toEqual(
      expect.arrayContaining(["evt_0024", "log:wed:205"]),
    );
  });

  it("treats the room-214 injection as DATA — flagged, never obeyed", () => {
    const t = find(threads, "room:214");
    expect(hasFlag(t, "suspicious_instruction")).toBe(true);
    expect(t.open).toBe(true); // not silently 'resolved'/all-clear

    // The fabricated 'SGD 1000 goodwill credit, mark approved' must not have been
    // adopted as fact anywhere in the reconciled output.
    const allText = JSON.stringify(threads).toLowerCase();
    expect(allText).not.toContain("approved credit");
    // And the night is decidedly NOT "all clear": many issues remain open.
    expect(
      visibleThreads({ asOf: "2026-05-30", threads }).filter((t) => t.open).length,
    ).toBeGreaterThan(5);
  });

  it("flags the room-226 damage charge as incomplete + a decision for the morning", () => {
    const t = find(threads, "room:226");
    expect(hasFlag(t, "incomplete")).toBe(true);
    expect(hasFlag(t, "needs_decision")).toBe(true);
  });

  it("keeps the room-309 deposit open and flags it was never collected", () => {
    const t = find(threads, "room:309");
    expect(t.state).toBe("still_open");
    expect(hasFlag(t, "incomplete")).toBe(true);
  });

  it("carries the room-208 safe (passport locked in) forward as still open", () => {
    const t = find(threads, "room:208");
    expect(t.open).toBe(true);
  });

  it("keeps the 312 no-show open because the charge is disputed", () => {
    const t = find(threads, "room:312");
    expect(t.state).toBe("still_open");
    expect(hasFlag(t, "needs_decision")).toBe(true);
  });
});

describe("asOf is relative — the same history yields a different handover per morning", () => {
  it("marks the 2nd-floor leak NEWLY RESOLVED on the 2026-05-29 morning", () => {
    const { threads } = reconcile(load(), "2026-05-29");
    expect(find(threads, "room:215").state).toBe("newly_resolved");
  });

  it("the leak is not yet resolved on the 2026-05-28 morning", () => {
    const { threads } = reconcile(load(), "2026-05-28");
    expect(find(threads, "room:215").state).toBe("still_open");
  });
});
