## What this changes

<!-- One or two sentences. -->

## Why

<!-- What question does this answer, or what does it fix? -->

## Checklist

- [ ] `pnpm check` passes (lint, typecheck, tests)
- [ ] A failing test was written first for any behaviour change
- [ ] No API keys, real player identifiers, or raw API responses are committed
- [ ] No automatic punishment (ban, kick, rollback) is introduced; review is still the ceiling

## If this changes a threshold, a question set, or the policy

- [ ] The threshold was chosen on the development split, not on the evaluation data
- [ ] `jevcraft repolicy` was re-run and the benchmark regenerated with `--dev-*`
- [ ] If the change was motivated by data that had already been scored, the pull request says so

## If this changes a claim in the docs

- [ ] The number in the text is reproducible from a command in the same document
- [ ] Any claim being weakened or withdrawn is recorded in `CHANGELOG.md`
