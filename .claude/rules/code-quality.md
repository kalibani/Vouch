# Rule: Code Quality

- **Strict TypeScript.** No `any`. `noUncheckedIndexedAccess` is on — handle
  `undefined` from indexing. Prefer narrow types and discriminated unions over
  loose objects.
- **Validate at boundaries.** Anything crossing a trust boundary — HTTP request
  body, model output, Supabase rows, env vars — is parsed with Zod before use.
- **Deterministic core.** `lib/reconcile/*` are pure functions: no I/O, no model,
  no `Date.now()` reaching in (pass `asOf`/timestamps as arguments). This is what
  makes the reconciliation logic exhaustively testable.
- **Small, single-purpose modules.** One responsibility per file; keep functions
  short enough to read whole. Don't add abstraction for a single caller.
- **Errors are explicit.** No silent catches. Surface failures with context
  (`runId`, stage). Model/DB calls have timeouts and bounded retries.
- **No over-engineering.** Build for the brief, not a hypothetical future. Note
  deliberate omissions in `DECISIONS.md` rather than half-building them.
- **Format/lint clean.** Biome must pass (`npm run lint`); `tsc --noEmit` must be
  green. The hooks enforce this — don't fight them.
