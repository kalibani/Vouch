# Rule: Git Operations

- **Conventional Commits**: `type(scope): subject` (imperative, lowercase).
  Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- **Do not squash.** The brief asks for full, honest history — each meaningful
  step is its own commit. Tests land in the same commit as the code they cover.
- Every commit ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Never** `git push --force`, `git reset --hard`, or `git commit --no-verify`.
- Work on `main` for this take-home (single, linear, readable history).
- **Never commit secrets.** `.env` is gitignored; verify staged files before each
  commit. A token or key must never enter a commit or an exported transcript.
- Run the full gate (`final-check.sh` / `/validate`) before committing feature code.
