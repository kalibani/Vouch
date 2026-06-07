import { describe, expect, it } from "vitest";
import { canonicalCategory } from "../lib/ingest/structured";

describe("canonicalCategory (free-text guess → structured vocabulary)", () => {
  it("aligns a corridor leak with structured 'facilities' so the thread doesn't split", () => {
    expect(
      canonicalCategory("maintenance", "steady drip in the 2nd floor corridor, carpet soaked"),
    ).toBe("facilities");
  });

  it("keeps a passport-in-the-safe issue as incident, NOT compliance (would mis-merge into immigration)", () => {
    expect(canonicalCategory("note", "guest's passport and cash locked inside the safe")).toBe(
      "incident",
    );
  });

  it("maps aircon→maintenance and no-show→no_show across sources", () => {
    expect(canonicalCategory("facilities", "112 aircon compressor needs ordering")).toBe(
      "maintenance",
    );
    expect(canonicalCategory("note", "the 312 no-show, charged one night per booking terms")).toBe(
      "no_show",
    );
  });
});
