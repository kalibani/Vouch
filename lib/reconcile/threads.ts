/**
 * Thread grouping + cross-night state — pure and deterministic.
 *
 * A "thread" is one issue tracked across nights. Events are grouped by a
 * deterministic key (immigration/compliance is topic-keyed because it spans many
 * rooms; everything else is keyed by room when known). State is computed RELATIVE
 * to the shift the handover is for, considering only events up to that shift —
 * you can't know future events at 7am.
 */
import {
  type Flag,
  type NormalizedEvent,
  type Thread,
  ThreadSchema,
  type ThreadState,
} from "../schema";
import { compareShiftKeys, shiftKey } from "./shifts";

const TOPIC_PREFIX = "topic:";

export function threadKeyOf(e: NormalizedEvent): string {
  if (e.category === "compliance") return `${TOPIC_PREFIX}immigration`;
  if (e.room) return `room:${e.room}`;
  return `solo:${e.id}`;
}

/** Order by true instant (epoch), NOT by ISO string: timestamps for one hotel
 * can carry different UTC offsets, and lexical string order would then be wrong.
 * "Latest event wins" is only correct if the sort is correct. */
function byInstant(a: NormalizedEvent, b: NormalizedEvent): number {
  return Date.parse(a.timestamp) - Date.parse(b.timestamp);
}

function firstNonNull<T>(xs: (T | null)[]): T | null {
  for (const x of xs) if (x !== null) return x;
  return null;
}

function titleFromCategory(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildThreads(events: NormalizedEvent[], asOfKey: string): Thread[] {
  // Honest handover: only consider events up to and including the asOf shift.
  const inScope = events.filter((e) => compareShiftKeys(shiftKey(e.timestamp), asOfKey) <= 0);

  const groups = new Map<string, NormalizedEvent[]>();
  for (const e of inScope) {
    const key = threadKeyOf(e);
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }

  const threads: Thread[] = [];
  for (const [key, group] of groups) {
    const evs = [...group].sort(byInstant);
    const first = evs[0];
    const last = evs[evs.length - 1];
    if (!first || !last) continue;

    const isTopic = key.startsWith(TOPIC_PREFIX);
    // Topic threads span many rooms/guests, so don't pin one of either.
    const room = isTopic ? null : firstNonNull(evs.map((e) => e.room));
    const guest = isTopic ? null : firstNonNull(evs.map((e) => e.guest));

    // "info" events (smooth check-in, held parcel) don't open or close an issue.
    const relevant = evs.filter((e) => e.openState !== "info");

    // Cluster the relevant events by category. A room can hold several distinct
    // issues at once; an aircon fault must not be marked resolved just because an
    // unrelated keycard issue closed later in the same room. The thread is open if
    // ANY category cluster is still open.
    const clusters = new Map<string, NormalizedEvent[]>();
    for (const e of relevant) {
      const arr = clusters.get(e.category);
      if (arr) arr.push(e);
      else clusters.set(e.category, [e]);
    }

    let anyOpen = false;
    let lastResolvedShift: string | null = null;
    for (const cluster of clusters.values()) {
      const latest = cluster[cluster.length - 1];
      if (!latest) continue;
      if (latest.openState === "open") {
        anyOpen = true;
      } else {
        const s = shiftKey(latest.timestamp);
        if (lastResolvedShift === null || compareShiftKeys(s, lastResolvedShift) > 0) {
          lastResolvedShift = s;
        }
      }
    }

    const firstShiftId = shiftKey(first.timestamp);
    const lastShiftId = shiftKey(last.timestamp);

    let open: boolean;
    let state: ThreadState;
    if (relevant.length === 0) {
      open = false;
      state = firstShiftId === asOfKey ? "new_tonight" : "resolved_earlier";
    } else if (anyOpen) {
      open = true;
      state = firstShiftId === asOfKey ? "new_tonight" : "still_open";
    } else {
      open = false;
      const resolvedShift = lastResolvedShift ?? lastShiftId;
      if (compareShiftKeys(resolvedShift, asOfKey) < 0) state = "resolved_earlier";
      else if (firstShiftId === asOfKey) state = "new_tonight";
      else state = "newly_resolved";
    }

    const category = (relevant[relevant.length - 1] ?? last).category;

    let title: string;
    if (isTopic) title = titleFromCategory(key.slice(TOPIC_PREFIX.length));
    else if (room) title = `Room ${room}`;
    else title = titleFromCategory(category);

    threads.push(
      ThreadSchema.parse({
        id: key,
        hotelId: first.hotelId,
        title,
        category,
        room,
        guest,
        events: evs,
        open,
        state,
        firstShiftId,
        lastShiftId,
        flags: [] as Flag[],
      }),
    );
  }
  return threads;
}
