import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EventsFileSchema, HandoverItemSchema } from "../lib/schema";

describe("EventsFileSchema", () => {
  it("accepts the provided sample events.json verbatim", () => {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "events.json"), "utf8"));
    const parsed = EventsFileSchema.parse(raw);

    expect(parsed.hotel.id).toBe("lumen-sg");
    expect(parsed.events).toHaveLength(26);
    // status is a free string (unseen values must not be rejected)
    expect(new Set(parsed.events.map((e) => e.status))).toContain("pending");
  });
});

describe("HandoverItemSchema grounding invariant", () => {
  it("rejects a handover item with no source events", () => {
    const ungrounded = {
      id: "i1",
      threadId: "t1",
      priority: "fyi",
      state: "new_tonight",
      category: "note",
      room: null,
      guest: null,
      headline: "An invented fact with no source.",
      flags: [],
      sourceEventIds: [], // empty — must fail
    };
    expect(() => HandoverItemSchema.parse(ungrounded)).toThrow();
  });
});
