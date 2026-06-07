# Rule: Context Management

This is a long, multi-session build. Don't lose grounding context to a
context-window reset.

- **Hand off before you're forced to.** When context use is high, run `/handover`
  *before* a reset — it writes `HANDOVER.md` (gitignored): where we are, the
  in-flight change, next steps, key decisions, watch-outs. A new session reads it
  first and resumes without re-deriving anything.
- **Delegate data-heavy reads to subagents.** Use `Explore`/`reviewer` subagents
  for large reads and reviews so their bulk doesn't fill the main context — keep
  only their conclusions.
- **Run independent work in parallel.** Dispatch builder subagents (`backend`,
  `frontend`) on *disjoint directories* concurrently; integrate and gate
  (`reviewer`, `groundedness-reviewer`) on the main thread. Only one agent should
  touch shared files like `package.json` at a time.
- **The repo is the source of truth.** git history + tests + `DECISIONS.md` +
  `CLAUDE.md` survive any reset. If `HANDOVER.md` and the repo disagree, trust the
  repo.
