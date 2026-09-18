# Contributing

- Branch from `main`; open a pull request. `pnpm check` must pass.
- Write the failing test first. Every schema change needs a test that shows what is now rejected.
- Never commit API keys, real player identifiers, raw API responses, or anything under `datasets/private/`.
- Keep Jev requests decomposed into independent questions; do not merge them into one big prompt.
- Do not add automatic punishments (ban, kick, rollback). Review outcomes are the ceiling.
- Record `model`, `questionSetVersion`, and `featureExtractorVersion` in every decision record.
