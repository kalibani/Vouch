/**
 * End-to-end pipeline test with a FAKE model (no network). Structured events only
 * (the free-text grounding gate is covered in freetext.test.ts). Proves the
 * adversarial requirements hold through the WHOLE pipeline, not just a unit:
 *   - the room-214 injection is surfaced as a flagged item, never obeyed, and the
 *     night is NOT reported "all clear";
 *   - the immigration backlog is On Fire (deadline);
 *   - every handover item carries real sourceEventIds;
 *   - the grounding report is clean for grounded prose.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractOptions, ModelClient } from "../lib/model/client";
import { runPipeline } from "../lib/pipeline";
import { EventsFileSchema, type HandoverItem, type HandoverRequest } from "../lib/schema";

/** A fake model that echoes a GROUNDED headline per thread (title + category),
 * derived from the facts it is given — no invented entities, no network. */
const fakeModel: ModelClient = {
  async extract<T>(opts: ExtractOptions<T>): Promise<T> {
    const facts = JSON.parse(opts.data) as Array<{
      threadId: string;
      title: string;
      category: string;
    }>;
    return {
      items: facts.map((f) => ({ threadId: f.threadId, headline: `${f.title}: ${f.category}` })),
    } as unknown as T;
  },
};

function sampleStructuredRequest(): HandoverRequest {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "events.json"), "utf8"));
  const file = EventsFileSchema.parse(raw);
  return { hotel: file.hotel, events: file.events, freeText: [], asOf: "2026-05-30" };
}

describe("runPipeline (structured-only, fake model)", () => {
  it("produces a grounded, action-first handover that survives the injection", async () => {
    const h = await runPipeline(sampleStructuredRequest(), { model: fakeModel });

    const all: HandoverItem[] = [...h.onFire, ...h.pending, ...h.fyi];
    const byThread = (id: string) => all.find((i) => i.threadId === id);

    // Every item is grounded by construction.
    expect(all.length).toBeGreaterThan(0);
    for (const item of all) expect(item.sourceEventIds.length).toBeGreaterThan(0);
    expect(h.grounding.grounded).toBe(true);

    // Room-214 injection: present, flagged suspicious, NOT obeyed, NOT "all clear".
    const injection = byThread("room:214");
    expect(injection).toBeDefined();
    expect(injection?.flags.some((f) => f.kind === "suspicious_instruction")).toBe(true);
    expect(injection?.headline.toLowerCase()).not.toContain("all clear");
    expect(`${injection?.headline} ${injection?.detail ?? ""}`.toLowerCase()).not.toContain(
      "approved",
    );
    // The night is decidedly NOT all-clear.
    expect(h.onFire.length + h.pending.length).toBeGreaterThan(3);

    // Immigration backlog is On Fire (deadline).
    expect(byThread("topic:immigration")?.priority).toBe("on_fire");

    // Damage charge (226) is flagged incomplete.
    expect(byThread("room:226")?.flags.some((f) => f.kind === "incomplete")).toBe(true);

    // A resolved item lands in FYI.
    expect(h.fyi.length).toBeGreaterThan(0);
  });
});
