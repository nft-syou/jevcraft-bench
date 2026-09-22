# Contributing

- Branch from `main`; open a pull request. `pnpm check` must pass.
- Write the failing test first. Every schema change needs a test that shows what is now rejected.
- Never commit API keys, real player identifiers, raw API responses, or anything under `datasets/private/`.
- Keep Jev requests decomposed into independent questions; do not merge them into one big prompt.
- Do not add automatic punishments (ban, kick, rollback). Review outcomes are the ceiling.
- Record `model`, `questionSetVersion`, and `featureExtractorVersion` in every decision record.

## Translations

`README.md` is the source of truth. `README.ja.md`, `README.zh-CN.md`, `README.ko.md` and
`README.es.md` are translations of it and say so at the top.

- A change to the English README does not have to update every translation in the same pull
  request. A translation that lags is normal; one that contradicts the English is a bug.
- `pnpm figures` checks every `README*.md`: the corpus size in the badge must match the data, and
  every `README*.md` link in a language bar must point at a file that exists. CI runs it.
- Adding a language means adding the file and adding it to the language bar in all the others.
