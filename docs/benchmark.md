# The JevCraft detection benchmark

## The question

Does asking Jev structured questions about a mining session catch X-Ray that the heuristics in
existing anti-cheat tooling miss, **at the same false-positive rate**, on sessions nobody tuned on?

False-positive rate is the ceiling, not an afterthought. A detector that flags twice as many
cheaters while also flagging twice as many ordinary players has improved nothing.

## The short answer, as of 2026-09-20

**No evidence of an advantage.** On held-out sessions the shipped policy and a plain ore-count
heuristic are level: 3 sessions each where only one of them is right, p = 1.0. On threshold-free
ranking the classic features do slightly better than Jev's answers. An earlier version of this
document claimed a lead; that claim came from a benchmark that tuned on its own evaluation data
and has been withdrawn.

## What it is compared against

Servers fight X-Ray in two ways, and only one of them is a detector:

- **Obfuscation** (Paper's anti-xray engine modes, Orebfuscator) lies to the client about which
  blocks are ore. That is prevention, not detection, and it is out of scope.
- **Behavioural heuristics** decide who to investigate. These are the baselines:

| Detector | Stands for |
| --- | --- |
| `ore-ratio` | Valuable ore blocks **mined** per 100 blocks broken. The dominant heuristic. |
| `reveal-ratio` | The same shape of rule counting first exposures instead. The two differ on most sessions. |
| `ore-percentile` | Efficiency ranked against a legitimate reference population. |
| `reveal-pace` | Reveals per 10 minutes: "too lucky, too fast" streak detectors. |
| `straight-line` | Mean directness of the approach to each hidden ore. |
| `classic-combo` | A hand-written rule combining efficiency and directness. |
| `fitted-logistic` | Logistic regression over the same features, fitted on the development split. |

`fitted-logistic` is there so the comparison is not only against rules someone wrote by hand:
anything JevCraft adds should beat a model that learns the best linear combination of exactly the
numbers it is given.

## How it is run

The 119 labelled sessions split by when they were recorded:

- **Development (77)**: the bot batches used to choose the question set, the approach gate and its
  0.15 threshold.
- **Held out (42)**: the second world seed and the human player's sessions, recorded after every
  one of those decisions was frozen.

```bash
node scripts/make-splits.mjs --dev-ids datasets/labels/bots-77.jsonl \
  --features datasets/features/all.jsonl --labels datasets/labels/all.jsonl \
  --decisions datasets/decisions/all-gated.jsonl --out-dir datasets/splits

pnpm jevcraft benchmark \
  --features datasets/splits/holdout-features.jsonl \
  --labels   datasets/splits/holdout-labels.jsonl \
  --decisions datasets/splits/holdout-decisions.jsonl \
  --dev-features datasets/splits/dev-features.jsonl \
  --dev-labels   datasets/splits/dev-labels.jsonl \
  --dev-decisions datasets/splits/dev-decisions.jsonl \
  --max-fpr 0.072 --out reports/benchmark-holdout.md
```

Every tunable detector picks its threshold on the development split and is then frozen. The
shipped policy has no threshold to pick: it emits one decision per session, so it is measured at
that point and the report states whether the point clears the ceiling. Running without `--dev-*`
is allowed but the report then says in its header that the numbers describe fit, not
generalisation. No API calls: everything reads archived answers.

## Result on the 42 held-out sessions (14 X-Ray, 28 legitimate)

Ceiling: FPR ≤ 0.072, which is the shipped policy's own operating point on this split.

| Detector | Recall | FPR | AUC |
| --- | --- | --- | --- |
| **jevcraft-policy** (fixed point) | 0.786 [0.52–0.92] | 0.071 | 0.857 |
| reveal-ratio | 0.714 [0.45–0.88] | 0.036 | 0.912 |
| reveal-pace | 0.643 [0.39–0.84] | 0.071 | 0.902 |
| jev-approach-targeting | 0.571 [0.33–0.79] | 0.036 | 0.881 |
| straight-line | 0.500 [0.27–0.73] | 0.000 | 0.904 |
| jev-likely-xray | 0.429 [0.21–0.67] | 0.000 | 0.860 |
| ore-percentile | 0.286 [0.12–0.55] | 0.000 | 0.894 |
| ore-ratio | 0.714 | 0.107 (over ceiling) | 0.903 |
| classic-combo | 0.857 | 0.107 (over ceiling) | 0.917 |
| fitted-logistic | 0.929 | 0.500 (over ceiling) | 0.837 |

Ranges are 95% Wilson intervals. Three detectors spent more false positives on the held-out set
than the ceiling allows, so their recall is not comparable and they are excluded from the duel.

Head to head, the policy against the strongest ceiling-respecting rival (`reveal-ratio`):

| Scope | Only policy right | Only reveal-ratio right | p |
| --- | --- | --- | --- |
| all sessions | 3 | 3 | 1.00 |
| detour positives | 2 | 1 | 1.00 |
| humanized positives | 1 | 1 | 1.00 |

## Reading this honestly

**The policy has the highest recall among detectors that stayed under the ceiling**, but
`reveal-ratio` reaches 0.714 at half the false-positive rate, so it is not dominated, and the
paired test is a dead heat. With 14 X-Ray sessions the recall interval spans 0.52 to 0.92: a
7-point difference is noise.

**On ranking quality the classics are ahead.** AUC needs no threshold, and there the ore-count
features sit at 0.90–0.92 against 0.86–0.88 for Jev's answers. Whatever the policy is adding, it
is not a better ordering of sessions.

**A fitted model overfits this dataset badly.** The logistic regression picked a cut-off on 77
development sessions that produced a 50% false-positive rate on the held-out ones. Eight features
and 77 examples from one world is not enough to learn from, which is worth knowing before anyone
proposes replacing the rules with a model.

**Sample size.** Doubling the data will not settle the earlier 12-vs-7 split either: at that
effect size roughly 750 sessions are needed for 80% power, not the 240 previously claimed here.

## What the labels actually mean

Positives are **scenario assignments, not observed cheating**. A session is labelled
`simulated_xray` because the bot that produced it was running an X-Ray scenario, and five such
sessions contain no ore reveal at all. So the benchmark measures "can the detector tell which
scenario was running", which is close to but not the same as "did this player use hidden
information".

The legitimate side is 51 bot sessions plus 11 from one human player. Observed false-positive
rates were 5.9% for bots and 9.1% for the human; both are small samples and neither supports a
claim about which is harder.

## Reproducibility

`reports/benchmark-holdout.md` and `reports/benchmark-119.md` are generated by the commands above
from `datasets/`, which is gitignored, so the archived copies under `docs/baselines/` are the
record. `jevcraft repolicy` writes a `.meta.json` beside its output listing the thresholds it
applied and a digest of the outcomes, so a rewritten decision file can be traced back to the
policy that produced it.
