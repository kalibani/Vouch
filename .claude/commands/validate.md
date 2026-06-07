---
description: Validate the current change against its success criteria before committing.
---

Run the full validation gate for the working change, then self-assess.

1. Run `npm run typecheck`, `npm run lint`, and `npm test`. Report pass/fail for each.
2. Re-read `.claude/rules/grounding-discipline.md` and check the change against it.
   If the change touches `lib/ingest`, `lib/reconcile`, `lib/generate`, or
   `lib/verify`, confirm the relevant adversarial tests exist and pass
   (room-214 injection, room-205 contradiction, immigration backlog accrual,
   grounding verifier rejects an ungrounded claim).
3. State a **confidence (1–5)** and the **evidence** (test names, reviewer verdict).
4. If confidence < 4 on a grounding-sensitive change, do NOT commit — explain what
   is unverified and what you'll do about it.
