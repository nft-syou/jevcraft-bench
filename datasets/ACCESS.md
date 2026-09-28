# Which data may be looked at, and which may not

A number is only worth publishing if it was produced on data that did not shape the thing being
measured. This project has broken that three times, each time by accident and each time only
caught later:

- the first benchmark claim, where the evaluation set contained the policy's own development data
- `reviewApproachTargetingAlone = 0.35`, chosen after the sessions it was measured on were scored
- the language-model ablation, where the baseline was fitted blind to an evasion the policy had seen

and then, in a single afternoon, spent the confirmation set three more times on exploratory work
that the development split could have carried.

Convention did not prevent any of that. So the status of every dataset is declared in
`datasets/access.json`, and `scripts/lib/dataset-access.mjs` refuses to read a sealed one without
a stated purpose.

## The three states

**`open`** — development data. Look at it, fit to it, iterate against it, change your mind, run the
same experiment twenty times. That is what it is for. Nothing measured on open data is a result;
it is a design decision with evidence attached.

**`sealed`** — a test set that has never been looked at. It may be spent **once**, on a question
written down before the spend. After that it is `spent` forever. There is no way to un-see data.

**`spent`** — was sealed, has been used. Its numbers stay valid for the question they were spent
on, and may be re-reported. It may not be used to decide anything new: not a threshold, not a
prompt, not which of two designs to keep. Re-running an experiment on spent data produces a number
that describes the data, not the method.

## The rule that matters

**Never let a `sealed` or `spent` dataset change what you build.** Reading it to report an outcome
is fine. Reading it and then adjusting a threshold, a question, a feature, or a choice between two
approaches is contamination, whatever the adjustment was.

The tell is simple: if seeing the result would change your next commit, you are using it as
feedback and must not be reading it.

## Spending a sealed set

1. Write the question and how the answer will be read. Commit that first, so the clock is checkable.
2. Run it once.
3. Add the use to `datasets/access.json` and flip the status to `spent`.
4. Report whatever came out, including when it is the answer you did not want.

## Cost

Sessions are the scarce resource, not compute and not API budget. A recording session takes about
ten minutes of server time and can answer exactly one question, once. Explore on `open` data;
record new sessions when there is a specific question worth spending them on.
