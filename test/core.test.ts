import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeStructured, singleRoomRef } from "../lib/ingest/structured";
import { addDays, shiftKey } from "../lib/reconcile/shifts";
import { type EventsFile, EventsFileSchema, type NormalizedEvent } from "../lib/schema";

function loadEvents(): EventsFile {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "events.json"), "utf8"));
  return EventsFileSchema.parse(raw);
}

describe("shift assignment (23:00–07:00, two-date span)", () => {
  it("maps a 02:40 timestamp to that morning's shift", () => {
    expect(shiftKey("2026-05-30T02:40:00+08:00")).toBe("2026-05-30");
  });
  it("maps a 23:xx timestamp to the NEXT morning's shift", () => {
    expect(shiftKey("2026-05-25T23:14:00+08:00")).toBe("2026-05-26");
    expect(shiftKey("2026-05-29T23:40:00+08:00")).toBe("2026-05-30");
  });
  it("maps a pre-07:00 timestamp to the same calendar date", () => {
    expect(shiftKey("2026-05-30T00:25:00+08:00")).toBe("2026-05-30");
  });
  it("reads wall-clock from the ISO offset, not the server timezone", () => {
    // Same instant, different offsets → different local nights.
    expect(shiftKey("2026-05-30T06:59:00+08:00")).toBe("2026-05-30");
    expect(shiftKey("2026-05-30T07:00:00+08:00")).toBe("2026-05-31");
  });
  it("does whole-day arithmetic across month boundaries", () => {
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
  });
});

describe("singleRoomRef", () => {
  it("extracts a lone room reference", () => {
    expect(singleRoomRef("Water leak in 2nd floor corridor near room 215.")).toBe("215");
  });
  it("refuses to guess when several rooms are named", () => {
    expect(singleRoomRef("3 passports could not be scanned: rooms 207, 210, 211.")).toBeNull();
  });
});

describe("structured normalization of the real sample", () => {
  let normalized: NormalizedEvent[];
  beforeAll(() => {
    const file = loadEvents();
    normalized = normalizeStructured(file.events, file.hotel.id);
  });

  const byId = (id: string) => {
    const e = normalized.find((n) => n.id === id);
    if (!e) throw new Error(`missing ${id}`);
    return e;
  };

  it("normalizes all 26 events", () => {
    expect(normalized).toHaveLength(26);
  });

  it("flags the room-214 prompt injection as data, not an instruction", () => {
    const e = byId("evt_0026");
    expect(e.containsEmbeddedInstruction).toBe(true);
  });

  it("does not flag ordinary operational notes as injections", () => {
    expect(byId("evt_0025").containsEmbeddedInstruction).toBe(false); // deposit-waived FYI
    expect(byId("evt_0010").containsEmbeddedInstruction).toBe(false); // no-show deferral
  });

  it("recovers a room from description when the structured field is null (leak → 215)", () => {
    expect(byId("evt_0008").room).toBe("215");
  });

  it("leaves multi-room compliance notes unattributed", () => {
    expect(byId("evt_0009").room).toBeNull();
    expect(byId("evt_0009").category).toBe("compliance");
    expect(byId("evt_0003").category).toBe("compliance"); // passport not scanned
  });

  it("classifies open vs resolved vs info", () => {
    expect(byId("evt_0002").openState).toBe("open"); // aircon unresolved
    expect(byId("evt_0013").openState).toBe("resolved"); // leak fixed
    expect(byId("evt_0001").openState).toBe("info"); // smooth check-in
  });
});
