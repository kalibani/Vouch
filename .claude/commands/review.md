---
description: Self-review the working diff (Sentinel-style) for correctness and grounding.
---

Review the working change before commit.

1. Show `git diff` and `git diff --staged` so the scope is explicit.
2. Dispatch the **reviewer** subagent over the diff for correctness, boundary
   validation, error handling, and test coverage.
3. If the change touches handover generation or verification, also dispatch the
   **groundedness-reviewer** over a freshly generated handover to confirm every
   line traces to a source and the injection stayed flagged.
4. Summarize findings as `{severity, location, issue, fix}` and apply the
   blocker/major fixes. Re-run `/validate` after fixing.
