/**
 * Reconciliation entry point — pure, deterministic, model-free.
 * Assigns shifts, groups events into cross-night threads, derives each thread's
 * state relative to the chosen morning, and attaches traceable flags.
 */
import type { NormalizedEvent, Thread } from "../schema";
import { computeFlags } from "./flags";
import { compareShiftKeys, shiftKey } from "./shifts";
import { buildThreads } from "./threads";

export { computeFlags } from "./flags";
export { compareShiftKeys, shiftFor, shiftKey } from "./shifts";
export { buildThreads, threadKeyOf } from "./threads";

/** The most recent shift present in the data — the default morning to build for. */
export function defaultAsOf(events: NormalizedEvent[]): string | null {
  let max: string | null = null;
  for (const e of events) {
    const k = shiftKey(e.timestamp);
    if (max === null || compareShiftKeys(k, max) > 0) max = k;
  }
  return max;
}

export interface Reconciliation {
  /** Morning date (YYYY-MM-DD) the handover is built for. */
  asOf: string;
  threads: Thread[];
}

export function reconcile(events: NormalizedEvent[], asOf?: string): Reconciliation {
  const key = asOf ?? defaultAsOf(events);
  if (!key) return { asOf: "", threads: [] };
  const threads = buildThreads(events, key).map((t) => ({
    ...t,
    flags: computeFlags(t),
  }));
  return { asOf: key, threads };
}

/** Threads worth showing on the handover — drops items resolved on earlier
 * shifts (already handled before this morning). */
export function visibleThreads(r: Reconciliation): Thread[] {
  return r.threads.filter((t) => t.state !== "resolved_earlier");
}
