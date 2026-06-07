/**
 * The pipeline — orchestrates ingest → persist → reconcile → generate → verify,
 * and persists an audit record. Structured logs (runId/hotel/shift/stage) make a
 * bad handover debuggable from logs alone.
 *
 * Grounding boundaries (see CLAUDE.md): the model touches only ingest (extraction,
 * span-verified) and generate (prose, entity-verified). Reconciliation state and
 * source linkage are deterministic.
 */
import { randomUUID } from "node:crypto";
import { ensureHotel, getEvents, saveHandoverRun, upsertEvents } from "./db/repository";
import { generateHeadlines } from "./generate";
import { extractFreeText } from "./ingest/freetext";
import { normalizeStructured } from "./ingest/structured";
import { runLogger } from "./logger";
import { createModelClient, type ModelClient } from "./model/client";
import { prioritize } from "./prioritize";
import { defaultAsOf, reconcile, visibleThreads } from "./reconcile";
import {
  type Handover,
  type HandoverItem,
  type HandoverRequest,
  HandoverSchema,
  type NormalizedEvent,
  type Thread,
} from "./schema";
import { verifyHandover } from "./verify";

export interface PipelineDeps {
  /** Injectable model client (real in prod, fake in tests — no network). */
  model?: ModelClient;
}

function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** A grounded headline derived purely from thread fields — used when the model
 * is unavailable or returns nothing for a thread. */
function deterministicHeadline(t: Thread): string {
  const who = t.room ? `Room ${t.room}` : t.title;
  return `${who}: ${t.category.replace(/_/g, " ")} (${t.state.replace(/_/g, " ")}).`;
}

function buildItem(
  t: Thread,
  gen: { headline: string; detail?: string } | undefined,
): HandoverItem {
  return {
    id: `item:${t.id}`,
    threadId: t.id,
    priority: prioritize(t),
    state: t.state,
    category: t.category,
    room: t.room,
    guest: t.guest,
    headline: gen?.headline ?? deterministicHeadline(t),
    detail: gen?.detail,
    flags: t.flags,
    // Source linkage is deterministic — the real event ids on this thread.
    sourceEventIds: t.events.map((e) => e.id),
  };
}

export async function runPipeline(
  req: HandoverRequest,
  deps: PipelineDeps = {},
): Promise<Handover> {
  const runId = randomUUID();
  const model = deps.model ?? createModelClient();
  const log = runLogger({ runId, hotel: req.hotel.id });

  // 1. INGEST — structured (pure) + free text (Haiku, span-verified).
  const structured = normalizeStructured(req.events, req.hotel.id);
  const freetext: NormalizedEvent[] = [];
  for (const ft of req.freeText) {
    const morningDate = ft.morningDate ?? req.asOf ?? defaultAsOf(structured) ?? "";
    try {
      const evs = await extractFreeText(ft, req.hotel.id, { morningDate, model });
      freetext.push(...evs);
      log.info(
        { stage: "ingest_freetext", label: ft.label, extracted: evs.length },
        "free-text extracted",
      );
    } catch (err) {
      log.error(
        { stage: "ingest_freetext", label: ft.label, err: String(err) },
        "free-text extraction failed",
      );
    }
  }
  let events: NormalizedEvent[] = [...structured, ...freetext];

  // 2. PERSIST (best-effort). events are the source of truth; when the DB is up we
  // reconcile over the hotel's full STORED history (accumulates across nights).
  if (dbConfigured()) {
    try {
      await ensureHotel(req.hotel);
      await upsertEvents(req.hotel.id, events);
      events = await getEvents(req.hotel.id);
      log.info(
        { stage: "persist", count: events.length },
        "events persisted; reconciling over stored history",
      );
    } catch (err) {
      log.warn(
        { stage: "persist", err: String(err) },
        "DB unavailable; reconciling over in-memory events",
      );
    }
  }

  // 3. RECONCILE (deterministic, model-free).
  const asOf = req.asOf ?? defaultAsOf(events) ?? "";
  const { threads } = reconcile(events, asOf);
  const visible = visibleThreads({ asOf, threads });
  log.info(
    {
      stage: "reconcile",
      asOf,
      threads: visible.length,
      flags: visible.flatMap((t) => t.flags.map((f) => f.kind)),
    },
    "threads reconciled",
  );

  // 4. GENERATE (Sonnet) — grounded prose; falls back to deterministic headlines.
  let headlines = new Map<string, { headline: string; detail?: string }>();
  try {
    headlines = await generateHeadlines(visible, model);
  } catch (err) {
    log.error(
      { stage: "generate", err: String(err) },
      "generation failed; using deterministic headlines",
    );
  }

  // 5. ASSEMBLE + 6. VERIFY (entity grounding gate).
  const rawItems = visible.map((t) => buildItem(t, headlines.get(t.id)));
  const threadsById = new Map(visible.map((t) => [t.id, t]));
  const { items, report } = verifyHandover(rawItems, threadsById);
  if (!report.grounded) {
    log.warn(
      { stage: "verify", unsupported: report.unsupported },
      "rewrote ungrounded headline(s)",
    );
  }

  const handover: Handover = HandoverSchema.parse({
    runId,
    hotel: { id: req.hotel.id, name: req.hotel.name },
    morningDate: asOf,
    shiftId: asOf,
    generatedAt: new Date().toISOString(),
    onFire: items.filter((i) => i.priority === "on_fire"),
    pending: items.filter((i) => i.priority === "pending"),
    fyi: items.filter((i) => i.priority === "fyi"),
    grounding: report,
  });

  // 7. PERSIST RUN (best-effort audit trail).
  if (dbConfigured()) {
    try {
      await saveHandoverRun({
        hotel_id: req.hotel.id,
        morning_date: asOf,
        shift_id: asOf,
        as_of: asOf,
        generated_at: handover.generatedAt,
        handover,
        grounding: report,
      });
    } catch (err) {
      log.warn({ stage: "persist_run", err: String(err) }, "failed to persist handover_run");
    }
  }

  log.info(
    {
      stage: "done",
      onFire: handover.onFire.length,
      pending: handover.pending.length,
      fyi: handover.fyi.length,
      grounded: report.grounded,
    },
    "handover generated",
  );
  return handover;
}
