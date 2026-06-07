/**
 * Structured logging (pino). Every run must be debuggable from logs alone, so
 * the convention is: bind `runId`, `hotel`, `shift`, and `stage` via
 * `runLogger(...)` and log structured objects, never interpolated strings.
 *
 * See `.claude/rules/grounding-discipline.md` §7.
 */
import pino, { type Logger } from "pino";

/** Bindings every pipeline log line should carry so a run is traceable. */
export interface RunBindings {
  runId?: string;
  hotel?: string;
  shift?: string;
  stage?: string;
}

/** Base logger. Level from `LOG_LEVEL` (default "info"). */
export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

/**
 * A child logger carrying run-scoped bindings. Use one per pipeline stage so
 * `runId` / `hotel` / `shift` / `stage` appear on every line without repetition.
 */
export function runLogger(bindings: RunBindings): Logger {
  return logger.child(bindings);
}
