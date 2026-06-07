---
description: Capture session state so a fresh session resumes without losing context.
---

Context is filling up (or we're switching sessions). Write a concise handover so
the next session continues seamlessly — without losing grounding context.

Write `HANDOVER.md` at the repo root (gitignored; overwrite each time), one screen max:

1. **Where we are** — the last commit (`git log --oneline -1`), what's working
   (tests passing? what the pipeline does end-to-end so far).
2. **In flight** — any uncommitted change and why (`git status --short`, `git diff --stat`).
3. **Next steps** — the ordered remaining tasks (mirror the todo list).
4. **Key decisions** — non-obvious choices made this session (and why) not already
   captured in `DECISIONS.md` or `CLAUDE.md`.
5. **Watch-outs** — open risks, pending reviewer findings, the Supabase-apply step,
   the `GITHUB_TOKEN`-in-`.env` push step.

Link to files by path; don't paste large code. The source of truth that survives a
reset is git + tests + `DECISIONS.md` + `CLAUDE.md` — if `HANDOVER.md` disagrees
with the repo, trust the repo.
