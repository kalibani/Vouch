# Rule: Validation Discipline

Define what "done" means *before* building, prove it *after*.

1. **Define success criteria first** — and where possible, write them as a failing
   test. For this project the criteria are concrete and often adversarial:
   - the room-214 injection must NOT change the handover to "all clear"
   - the room-205 contradiction must appear as a flag
   - the immigration backlog must accumulate rooms across nights
   - the grounding verifier must reject an ungrounded claim
2. **Implement** the smallest thing that satisfies the criteria.
3. **Validate** — run `tsc --noEmit`, Biome, and Vitest (the Stop hook does this
   automatically). For grounding-sensitive changes, also run the
   `groundedness-reviewer` subagent over a generated handover.
4. **State confidence + evidence** before committing: a 1–5 confidence and the
   concrete evidence (test names, reviewer verdict). If confidence < 4 on a
   grounding-sensitive change, do not commit — investigate.
5. **Capture corrections** — if a review or test reveals a wrong assumption, fix
   the code *and* add the test that would have caught it.
