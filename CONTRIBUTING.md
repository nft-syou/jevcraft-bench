# Contributing

- Branch from `main`; open a pull request. `pnpm check` must pass.
- Write the failing test first. Every schema change needs a test that shows what is now rejected.
- Never commit API keys, real player identifiers, raw API responses, or anything under `datasets/private/`.
- Keep Jev requests decomposed into independent questions; do not merge them into one big prompt.
- Do not add automatic punishments (ban, kick, rollback). Review outcomes are the ceiling.
- Record `model`, `questionSetVersion`, and `featureExtractorVersion` in every decision record.

## Settled decisions

`docs/decisions.md` records directions that have already been decided, and
`pnpm decisions-check` enforces the parts that can be enforced. A decision is changed by editing
that file in a commit that says why, never by quietly building something that contradicts it.

The one with teeth today is D1: evidence sent to the model is the raw trace, not the summarised
approach numbers, because those numbers were designed for a threshold rule to read and handing
them to the model measures the bottleneck rather than the model. A script that calls the backend
carries an `// EVIDENCE:` marker, and `raw` is the only value that needs no justification.

## Which data you may look at

`datasets/ACCESS.md` is the rule and `datasets/access.json` is the state. In short: explore on the
open development split, and treat a sealed test set as something you may spend once, on a question
you wrote down first.

- Never let a spent or sealed dataset change what you build. Reading it to report an outcome is
  fine; reading it and then adjusting a threshold, a prompt, a feature or a choice between designs
  is contamination whatever the adjustment was.
- A script that reads spent or sealed data needs an `// ACCESS:` marker saying why. `pnpm access-check`
  checks this and CI runs it.
- The test is simple: if seeing the result would change your next commit, you should not be
  reading it.

## Translations

`README.md` is the source of truth. `README.ja.md`, `README.zh-CN.md`, `README.ko.md` and
`README.es.md` are translations of it and say so at the top.

- A change to the English README does not have to update every translation in the same pull
  request. A translation that lags is normal; one that contradicts the English is a bug.
- `pnpm figures` checks every `README*.md`: the corpus size in the badge must match the data, and
  every `README*.md` link in a language bar must point at a file that exists. CI runs it.
- Adding a language means adding the file and adding it to the language bar in all the others.
