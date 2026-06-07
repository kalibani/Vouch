/**
 * Night-shift assignment — pure, deterministic, timezone-honest.
 *
 * A shift runs roughly 23:00–07:00 and spans two calendar dates. We identify a
 * shift by its MORNING date (the date the handover is for). The wall-clock time
 * is read directly from the ISO string (which already encodes the local offset),
 * so we never depend on the server's timezone or on `Date.now()`.
 */
import { type Shift, ShiftSchema } from "../schema";

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** Hour (local) at which a night shift ends. Anything before it belongs to the
 * shift whose morning is that same calendar date; anything at/after it belongs
 * to the upcoming night (morning = next date). */
const NIGHT_END_HOUR = 7;

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function parseWallClock(iso: string): WallClock {
  const m = WALL.exec(iso);
  if (!m) throw new Error(`unparseable timestamp: ${iso}`);
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function ymd(y: number, mo: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}`;
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. UTC math avoids DST drift. */
export function addDays(date: string, delta: number): string {
  const parts = date.split("-");
  const dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** The morning date (YYYY-MM-DD) of the night shift a timestamp falls in. */
export function shiftKey(iso: string): string {
  const w = parseWallClock(iso);
  const sameDay = ymd(w.year, w.month, w.day);
  return w.hour < NIGHT_END_HOUR ? sameDay : addDays(sameDay, 1);
}

/** The full Shift descriptor for a timestamp. */
export function shiftFor(iso: string, hotelId: string): Shift {
  const morningDate = shiftKey(iso);
  const eveningDate = addDays(morningDate, -1);
  return ShiftSchema.parse({
    id: morningDate,
    hotelId,
    startsAt: `${eveningDate}T23:00:00`,
    endsAt: `${morningDate}T07:00:00`,
    morningDate,
  });
}

/** Chronological comparison of shift keys (lexicographic works for YYYY-MM-DD). */
export function compareShiftKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
