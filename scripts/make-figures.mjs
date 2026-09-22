#!/usr/bin/env node
// Renders the figures used by README.md and docs/evasion.md.
//
// Two modes, because the session-level datasets are gitignored and CI cannot see them:
//
//   node scripts/make-figures.mjs --refresh   reads datasets/{features,labels}, recomputes the
//                                             aggregates into docs/figure-data.json, then renders
//   node scripts/make-figures.mjs             renders from docs/figure-data.json alone
//
// The second form needs only tracked files, so CI can re-render and fail if the committed SVGs
// have drifted from the committed aggregates.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    refresh: { type: "boolean", default: false },
    data: { type: "string", default: "docs/figure-data.json" },
    "out-dir": { type: "string", default: "docs/images" },
  },
});

const readJsonl = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

/* ------------------------------------------------------------------ aggregates */

// Thresholds every scored detector was frozen at on the 77-session development split.
// They are reported in docs/baselines/2026-09-21-benchmark-evasive.md.
const DEV_THRESHOLDS = {
  oreRatio: 4.13, // valuable ore mined per 100 blocks broken
  revealRatio: 4.36, // hidden-ore first exposures per 100 blocks broken
  revealPace: 17.74, // first exposures per 10 minutes
  directness: 0.74, // mean approach directness
};
const RATIO_BINS = [0, 1, 2, 3, 4, 5, 6, 8, 12, Number.POSITIVE_INFINITY];
const RATIO_BIN_LABELS = ["0-1", "1-2", "2-3", "3-4", "4-5", "5-6", "6-8", "8-12", "12+"];

function collectSessions() {
  const sources = [
    [
      "main",
      "datasets/features/all2.jsonl",
      "datasets/labels/all2.jsonl",
      "datasets/decisions/all2-gated.jsonl",
    ],
    [
      "confirmation",
      "datasets/features/confirm.jsonl",
      "datasets/labels/confirm.jsonl",
      "datasets/decisions/confirm-gated.jsonl",
    ],
  ];
  const sessions = [];
  for (const [cohort, featurePath, labelPath, decisionPath] of sources) {
    if (!fs.existsSync(featurePath) || !fs.existsSync(labelPath)) continue;
    const labels = new Map(
      readJsonl(labelPath)
        .filter((l) => l.label !== "unknown")
        .map((l) => [l.sessionId, l]),
    );
    const outcomes = fs.existsSync(decisionPath)
      ? new Map(readJsonl(decisionPath).map((d) => [d.sessionId, d.policyOutcome]))
      : new Map();
    for (const f of readJsonl(featurePath)) {
      const label = labels.get(f.sessionId);
      if (!label) continue;
      const blocks = Math.max(1, f.session.blocksBroken);
      sessions.push({
        cohort,
        label: label.label,
        subtype: label.subtype,
        oreRatio: (f.session.valuableOreBlocksBroken * 100) / blocks,
        revealRatio: (f.session.valuableOreReveals * 100) / blocks,
        revealPace: (f.session.valuableOreReveals * 600) / Math.max(1, f.session.durationSec),
        directness: f.hiddenOreApproach.meanDirectness,
        outcome: outcomes.get(f.sessionId) ?? null,
      });
    }
  }
  return sessions;
}

function buildAggregates() {
  const sessions = collectSessions();
  if (sessions.length === 0) throw new Error("no labelled sessions found; run the pipeline first");

  const populations = [
    { key: "legit", name: "Legitimate mining", rows: sessions.filter((s) => s.label === "legit") },
    {
      key: "greedy",
      name: "X-Ray, greedy",
      rows: sessions.filter((s) => s.label !== "legit" && s.subtype !== "throttled_xray"),
    },
    {
      key: "throttled",
      name: "X-Ray, ratio-throttled",
      rows: sessions.filter((s) => s.subtype === "throttled_xray"),
    },
  ];

  const oreRatio = {
    threshold: DEV_THRESHOLDS.oreRatio,
    binLabels: RATIO_BIN_LABELS,
    groups: populations.map((p) => {
      const counts = new Array(RATIO_BIN_LABELS.length).fill(0);
      for (const s of p.rows) {
        for (let i = 0; i < RATIO_BIN_LABELS.length; i++) {
          if (s.oreRatio >= RATIO_BINS[i] && s.oreRatio < RATIO_BINS[i + 1]) {
            counts[i]++;
            break;
          }
        }
      }
      return {
        name: p.name,
        n: p.rows.length,
        counts,
        above: p.rows.filter((s) => s.oreRatio >= DEV_THRESHOLDS.oreRatio).length,
      };
    }),
  };

  // Detection on the ratio-throttled population, every detector at its frozen threshold.
  const throttled = populations.find((p) => p.key === "throttled").rows;
  const flagged = (s) => s.outcome === "review" || s.outcome === "high_priority_review";
  const detectors = [
    {
      name: "ore ratio",
      note: "the dominant existing heuristic",
      hit: (s) => s.oreRatio >= DEV_THRESHOLDS.oreRatio,
    },
    {
      name: "reveal ratio",
      note: "the same rule on first exposures",
      hit: (s) => s.revealRatio >= DEV_THRESHOLDS.revealRatio,
    },
    {
      name: "reveal pace",
      note: "too lucky, too fast",
      hit: (s) => s.revealPace >= DEV_THRESHOLDS.revealPace,
    },
    { name: "JevCraft policy", note: "Jev answers plus the policy", hit: flagged },
    {
      name: "approach directness",
      note: "from this project's telemetry",
      hit: (s) => s.directness !== null && s.directness >= DEV_THRESHOLDS.directness,
    },
  ];
  // Kept apart on purpose. The first 15 sessions are what motivated the policy's approach-alone
  // rule, so they cannot confirm it; the 10 recorded after the rule was frozen can.
  const cohorts = [
    {
      key: "holdout",
      name: "held out",
      note: "motivated the rule",
      rows: throttled.filter((s) => s.cohort === "main"),
    },
    {
      key: "confirmation",
      name: "confirmation",
      note: "recorded after it was frozen",
      rows: throttled.filter((s) => s.cohort === "confirmation"),
    },
  ];
  const throttledDetection = {
    cohorts: cohorts.map((c) => ({ key: c.key, name: c.name, note: c.note, n: c.rows.length })),
    detectors: detectors.map((d) => ({
      name: d.name,
      note: d.note,
      caught: cohorts.map((c) => c.rows.filter(d.hit).length),
    })),
  };

  // Recall by evasion style, from the 57-session held-out benchmark. Direct X-Ray is left out:
  // every detector scores 1.000 on it, so the column carries no information.
  const complementarity = {
    columns: [
      { name: "detour", note: "wandering route", n: 5 },
      { name: "humanized", note: "mixed pacing", n: 5 },
      { name: "throttled", note: "diluted ore ratio", n: 15 },
    ],
    rows: [
      { name: "ore ratio", note: "the dominant existing heuristic", values: [0.8, 0.4, 0.0] },
      { name: "reveal ratio", note: "the same rule on first exposures", values: [0.6, 0.6, 0.0] },
      {
        name: "approach directness",
        note: "from this project's telemetry",
        values: [0.0, 0.6, 0.8],
      },
      { name: "JevCraft policy", note: "Jev answers plus the policy", values: [0.8, 0.6, 0.667] },
    ],
  };

  return {
    generatedFrom: "datasets/features/{all2,confirm}.jsonl + matching labels and decisions",
    sessionCount: sessions.length,
    devThresholds: DEV_THRESHOLDS,
    oreRatio,
    throttledDetection,
    complementarity,
  };
}

/* ------------------------------------------------------------------ drawing */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = "#1f2328";
const MUTED = "#57606a";
const GRID = "#d8dee4";
const BG = "#ffffff";
const PALETTE = ["#1a7f37", "#8250df", "#cf222e"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n1 = (v) => Number(v).toFixed(1);

const text = (x, y, s, { size = 12.5, fill = MUTED, weight = 400, anchor = "start" } = {}) =>
  `<text x="${n1(x)}" y="${n1(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const open = (w, h, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">\n<rect width="${w}" height="${h}" fill="${BG}"/>`;

/* figure 0: the pipeline, from a player breaking a block to a scored report */
function drawPipeline() {
  const ACCENT = "#0969da";
  const SOFT = "#ddf4ff";
  const DEEP = "#0a3069";
  const W = 840;
  const H = 846;
  const boxH = 62;
  // One column for the pipeline, one for the labelling path, so nothing has to cross.
  const mainX = 84;
  const mainW = 372;
  const halfW = 176;
  const rightHalfX = mainX + 196;
  const sideX = 566;
  const sideW = 232;
  const cx = mainX + mainW / 2;
  const sideCx = sideX + sideW / 2;

  const srcY = 96;
  const stageY = [216, 336, 456, 576];
  const outY = 696;
  const railY = 792; // the labelling path runs below everything, hugging the right margin

  const out = [open(W, H, "How a broken block becomes a review request")];
  out.push(
    `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${MUTED}"/></marker>` +
      `<marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${ACCENT}"/></marker></defs>`,
  );

  const box = (x, y, w, title, subtitle, { stroke = GRID, titleFill = INK } = {}) =>
    [
      `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${boxH}" rx="7" fill="${BG}" stroke="${stroke}" stroke-width="1.5"/>`,
      text(x + w / 2, y + 26, title, { size: 14, fill: titleFill, weight: 600, anchor: "middle" }),
      text(x + w / 2, y + 44, subtitle, { size: 11.5, anchor: "middle" }),
    ].join("\n");

  // Points are joined with right angles only, which is what keeps the two paths from tangling.
  const path = (points, { dashed = false, color = MUTED } = {}) =>
    `<path d="M ${points.map((p) => `${n1(p[0])} ${n1(p[1])}`).join(" L ")}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linejoin="round"${dashed ? ' stroke-dasharray="4 4"' : ""} marker-end="url(#${color === ACCENT ? "b" : "a"})"/>`;

  // The artifact handed from one stage to the next, drawn on the arrow itself.
  const chip = (x, y, label) => {
    const w = label.length * 6.4 + 22;
    return [
      `<rect x="${n1(x - w / 2)}" y="${n1(y - 11)}" width="${n1(w)}" height="22" rx="11" fill="${SOFT}"/>`,
      text(x, y + 4, label, { size: 11.5, fill: DEEP, anchor: "middle" }),
    ].join("\n");
  };

  out.push(
    text(24, 32, "How a broken block becomes a review request", {
      size: 17,
      fill: INK,
      weight: 600,
    }),
  );
  out.push(
    text(
      24,
      54,
      "The plugin only records. Every stage below it runs offline, over the JSONL the plugin wrote.",
    ),
  );

  // sources, with the bot recorder on the right so its manifest reaches label-runs without crossing
  out.push(box(mainX, srcY, halfW, "human players", "ordinary sessions"));
  out.push(box(rightHalfX, srcY, halfW, "bot-recorder", "Mineflayer scenarios"));

  const stages = [
    ["Paper server", "JevCraft plugin, shadow mode"],
    ["jevcraft extract", "6-neighbour hidden-ore rule"],
    ["jevcraft evaluate", "Jev, question set xray-v6"],
    ["policy", "review, or no action"],
  ];
  stages.forEach(([title, sub], i) => {
    out.push(box(mainX, stageY[i], mainW, title, sub, { stroke: ACCENT, titleFill: ACCENT }));
  });

  out.push(
    path([
      [mainX + halfW / 2, srcY + boxH],
      [mainX + halfW / 2, stageY[0] - 4],
    ]),
  );
  out.push(
    path([
      [rightHalfX + halfW / 2, srcY + boxH],
      [rightHalfX + halfW / 2, stageY[0] - 4],
    ]),
  );

  const flows = [
    "raw telemetry JSONL",
    "MiningSessionFeatures, 15-minute windows",
    "DecisionRecord, typed probabilities",
  ];
  flows.forEach((label, i) => {
    const from = stageY[i] + boxH;
    const to = stageY[i + 1];
    out.push(
      path(
        [
          [cx, from],
          [cx, to - 4],
        ],
        { color: ACCENT },
      ),
    );
    out.push(chip(cx, (from + to) / 2, label));
  });

  out.push(box(mainX, outY, halfW, "jevcraft report", "confusion matrix, FPR"));
  out.push(box(rightHalfX, outY, halfW, "jevcraft benchmark", "vs classic heuristics"));
  const policyBottom = stageY[3] + boxH;
  out.push(
    path(
      [
        [cx, policyBottom],
        [cx, policyBottom + 20],
        [mainX + halfW / 2, policyBottom + 20],
        [mainX + halfW / 2, outY - 4],
      ],
      { color: ACCENT },
    ),
  );
  out.push(
    path(
      [
        [cx, policyBottom],
        [cx, policyBottom + 20],
        [rightHalfX + halfW / 2, policyBottom + 20],
        [rightHalfX + halfW / 2, outY - 4],
      ],
      { color: ACCENT },
    ),
  );

  // the labelling path: it feeds the scoring, never the decision
  out.push(box(sideX, srcY, sideW, "jevcraft label-runs", "joins by HMAC id and time"));
  out.push(
    path(
      [
        [rightHalfX + halfW, srcY + boxH / 2],
        [sideX - 4, srcY + boxH / 2],
      ],
      { dashed: true },
    ),
  );
  out.push(
    text((rightHalfX + halfW + sideX) / 2, srcY + boxH / 2 - 10, "run manifest", {
      size: 11,
      anchor: "middle",
    }),
  );
  out.push(
    path(
      [
        [mainX + mainW, stageY[0] + boxH / 2],
        [sideCx, stageY[0] + boxH / 2],
        [sideCx, srcY + boxH + 4],
      ],
      { dashed: true },
    ),
  );
  out.push(
    text(mainX + mainW + 12, stageY[0] + boxH / 2 - 10, "which session was whose", { size: 11 }),
  );

  const rail = sideX + sideW;
  out.push(
    `<path d="M ${rail} ${srcY + boxH / 2} L ${W - 24} ${srcY + boxH / 2} L ${W - 24} ${railY} L ${mainX + halfW / 2} ${railY}" stroke="${MUTED}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-dasharray="4 4"/>`,
  );
  out.push(
    path(
      [
        [mainX + halfW / 2, railY],
        [mainX + halfW / 2, outY + boxH + 4],
      ],
      { dashed: true },
    ),
  );
  out.push(
    path(
      [
        [rightHalfX + halfW / 2, railY],
        [rightHalfX + halfW / 2, outY + boxH + 4],
      ],
      { dashed: true },
    ),
  );
  out.push(text(W - 34, railY - 12, "ground truth", { size: 11, anchor: "end" }));

  out.push(
    text(
      24,
      H - 18,
      "Dashed is ground truth. It reaches the report and the benchmark, and never the policy.",
      { size: 11.5 },
    ),
  );
  out.push("</svg>");
  return out.join("\n");
}

/* figure 1: where the three populations sit on the ore ratio */
function drawOreRatio(agg) {
  const { groups, binLabels, threshold } = agg.oreRatio;
  const nBins = binLabels.length;
  const W = 860;
  const PAD = { top: 112, right: 28, bottom: 74, left: 196 };
  const panelH = 104;
  const gap = 20;
  const H = PAD.top + (panelH + gap) * groups.length - gap + PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const binW = plotW / nBins;
  const yMax = 0.75; // share of the population, so groups of different size compare directly

  const out = [
    open(W, H, "Distribution of valuable ore mined per 100 blocks broken, by session type"),
  ];
  out.push(
    text(24, 32, "A throttled cheat hides inside the legitimate ore ratio", {
      size: 17,
      fill: INK,
      weight: 600,
    }),
  );
  out.push(
    text(
      24,
      54,
      `Share of each population by valuable ore mined per 100 blocks broken. ${agg.sessionCount} labelled sessions.`,
    ),
  );

  // The threshold falls inside a bin, so the rule is drawn at that bin's left edge.
  const thresholdBin = Math.min(nBins - 1, Math.floor(threshold));
  const tx = PAD.left + thresholdBin * binW;
  out.push(
    `<line x1="${n1(tx)}" y1="${PAD.top - 26}" x2="${n1(tx)}" y2="${H - PAD.bottom + 10}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 4"/>`,
  );
  out.push(
    text(tx + 8, PAD.top - 32, `ore-ratio detection threshold, ${threshold}`, {
      size: 12,
      fill: INK,
      weight: 600,
    }),
  );

  groups.forEach((g, i) => {
    const top = PAD.top + (panelH + gap) * i;
    const base = top + panelH;
    const color = PALETTE[i % PALETTE.length];
    out.push(
      `<line x1="${PAD.left}" y1="${base}" x2="${PAD.left + plotW}" y2="${base}" stroke="${GRID}" stroke-width="1"/>`,
    );
    out.push(
      text(PAD.left - 16, top + 24, g.name, { size: 13.5, fill: INK, weight: 600, anchor: "end" }),
    );
    out.push(text(PAD.left - 16, top + 44, `${g.n} sessions`, { size: 12, anchor: "end" }));
    out.push(
      text(PAD.left - 16, top + 63, `${g.above} above the threshold`, {
        size: 12,
        weight: 600,
        fill: g.above === 0 ? PALETTE[0] : INK,
        anchor: "end",
      }),
    );
    g.counts.forEach((c, b) => {
      if (c === 0) return;
      const barH = Math.max(2, (Math.min(c / g.n, yMax) / yMax) * panelH);
      out.push(
        `<rect x="${n1(PAD.left + b * binW + 2)}" y="${n1(base - barH)}" width="${n1(binW - 4)}" height="${n1(barH)}" fill="${color}" fill-opacity="0.8"/>`,
      );
      out.push(
        text(PAD.left + b * binW + binW / 2, base - barH - 6, String(c), {
          size: 10.5,
          anchor: "middle",
        }),
      );
    });
  });

  binLabels.forEach((label, b) => {
    out.push(
      text(PAD.left + b * binW + binW / 2, H - PAD.bottom + 30, label, {
        size: 11.5,
        anchor: "middle",
      }),
    );
  });
  out.push(
    text(
      PAD.left + plotW / 2,
      H - PAD.bottom + 54,
      "valuable ore mined per 100 blocks broken (bar labels are session counts)",
      {
        anchor: "middle",
      },
    ),
  );
  out.push("</svg>");
  return out.join("\n");
}

/* figure 2: what each detector catches on the throttled population, by cohort */
function drawThrottledDetection(agg) {
  const { detectors, cohorts } = agg.throttledDetection;
  const COHORT_FILL = ["#0969da", "#1a7f37"];
  const W = 820;
  const PAD = { top: 118, right: 74, bottom: 58, left: 224 };
  const rowH = 62;
  const barH = 18;
  const H = PAD.top + rowH * detectors.length + PAD.bottom;
  const plotW = W - PAD.left - PAD.right;

  const out = [
    open(W, H, "Share of ratio-throttled X-Ray sessions caught, by detector and cohort"),
  ];
  out.push(
    text(24, 32, "Ore counting catches none of the throttled cheats", {
      size: 17,
      fill: INK,
      weight: 600,
    }),
  );
  out.push(
    text(
      24,
      54,
      "Each detector at its frozen development threshold. Bar length is the share of that cohort.",
    ),
  );

  // Legend, which also carries why the two cohorts are not pooled.
  cohorts.forEach((c, i) => {
    const lx = 24 + i * 300;
    out.push(
      `<rect x="${lx}" y="${PAD.top - 44}" width="13" height="13" rx="2.5" fill="${COHORT_FILL[i]}" fill-opacity="0.85"/>`,
    );
    out.push(
      text(lx + 20, PAD.top - 33, `${c.name} (n=${c.n})`, { size: 12.5, fill: INK, weight: 600 }),
    );
    out.push(text(lx + 20, PAD.top - 17, c.note, { size: 11.5 }));
  });

  for (let pct = 0; pct <= 100; pct += 25) {
    const gx = PAD.left + (pct / 100) * plotW;
    out.push(
      `<line x1="${n1(gx)}" y1="${PAD.top - 6}" x2="${n1(gx)}" y2="${H - PAD.bottom + 4}" stroke="${GRID}" stroke-width="1"/>`,
    );
    out.push(text(gx, H - PAD.bottom + 22, `${pct}%`, { size: 11.5, anchor: "middle" }));
  }
  out.push(
    text(PAD.left + plotW / 2, H - PAD.bottom + 44, "share of the cohort caught", {
      anchor: "middle",
    }),
  );

  detectors.forEach((d, i) => {
    const top = PAD.top + rowH * i;
    out.push(
      text(PAD.left - 16, top + 22, d.name, { size: 13, fill: INK, weight: 600, anchor: "end" }),
    );
    out.push(text(PAD.left - 16, top + 39, d.note, { size: 11, anchor: "end" }));
    d.caught.forEach((caught, c) => {
      const n = cohorts[c].n;
      const y = top + 8 + c * (barH + 6);
      const w = (caught / n) * plotW;
      const zero = caught === 0;
      out.push(
        `<rect x="${PAD.left}" y="${n1(y)}" width="${n1(Math.max(w, 2.5))}" height="${barH}" rx="3" fill="${zero ? "#cf222e" : COHORT_FILL[c]}" fill-opacity="${zero ? 1 : 0.85}"/>`,
      );
      out.push(
        text(PAD.left + w + 9, y + barH - 4, `${caught} / ${n}`, {
          size: 12,
          fill: zero ? "#cf222e" : INK,
          weight: 600,
        }),
      );
    });
  });
  out.push("</svg>");
  return out.join("\n");
}

/* figure 3: each evasion style defeats a different detector */
function drawComplementarity(agg) {
  const { columns, rows } = agg.complementarity;
  const W = 760;
  const PAD = { top: 128, right: 28, bottom: 78, left: 230 };
  const rowH = 62;
  const colW = (W - PAD.left - PAD.right) / columns.length;
  const H = PAD.top + rowH * rows.length + PAD.bottom;

  // Pale at 0, saturated at 1, and light enough for dark text everywhere.
  const shade = (v) => {
    const t = Math.max(0, Math.min(1, v));
    return `rgb(${Math.round(255 - t * 172)},${Math.round(255 - t * 108)},${Math.round(255 - t * 32)})`;
  };

  const out = [open(W, H, "Recall by X-Ray evasion style")];
  out.push(
    text(24, 32, "Each evasion style defeats a different detector", {
      size: 17,
      fill: INK,
      weight: 600,
    }),
  );
  out.push(
    text(
      24,
      54,
      "Recall on 57 held-out sessions, thresholds frozen on a separate 77-session development split.",
    ),
  );
  out.push(text(24, 72, "Direct X-Ray is left out: every detector scores 100% on it."));

  columns.forEach((c, j) => {
    const cx = PAD.left + colW * j + colW / 2;
    out.push(
      text(cx, PAD.top - 26, c.name, { size: 13.5, fill: INK, weight: 600, anchor: "middle" }),
    );
    out.push(text(cx, PAD.top - 10, `${c.note} (n=${c.n})`, { size: 11.5, anchor: "middle" }));
  });

  rows.forEach((r, i) => {
    const y = PAD.top + rowH * i;
    out.push(
      text(PAD.left - 18, y + rowH / 2 - 3, r.name, {
        size: 13.5,
        fill: INK,
        weight: 600,
        anchor: "end",
      }),
    );
    out.push(text(PAD.left - 18, y + rowH / 2 + 14, r.note, { size: 11.5, anchor: "end" }));
    r.values.forEach((v, j) => {
      const cx = PAD.left + colW * j;
      out.push(
        `<rect x="${n1(cx + 5)}" y="${n1(y + 6)}" width="${n1(colW - 10)}" height="${rowH - 12}" rx="5" fill="${shade(v)}" stroke="${GRID}" stroke-width="1"/>`,
      );
      out.push(
        text(cx + colW / 2, y + rowH / 2 + 6, `${Math.round(v * 100)}%`, {
          size: 16,
          fill: INK,
          weight: 700,
          anchor: "middle",
        }),
      );
    });
  });

  out.push(
    text(
      24,
      H - PAD.bottom + 32,
      "Ore counting handles the greedy wanderer and misses the throttled cheat; approach directness does the reverse.",
    ),
  );
  out.push(
    text(
      24,
      H - PAD.bottom + 52,
      "With five to fifteen sessions per style, no single cell difference is statistically significant.",
    ),
  );
  out.push("</svg>");
  return out.join("\n");
}

/* ------------------------------------------------------------------ main */

let aggregates;
if (values.refresh) {
  aggregates = buildAggregates();
  fs.mkdirSync(path.dirname(values.data), { recursive: true });
  fs.writeFileSync(values.data, `${JSON.stringify(aggregates, null, 2)}\n`);
  console.log(`refreshed ${values.data} from ${aggregates.sessionCount} labelled sessions`);
} else {
  if (!fs.existsSync(values.data)) {
    console.error(`${values.data} is missing. Run with --refresh once, with the datasets present.`);
    process.exit(1);
  }
  aggregates = JSON.parse(fs.readFileSync(values.data, "utf8"));
}

const outDir = values["out-dir"];
fs.mkdirSync(outDir, { recursive: true });
const figures = [
  ["pipeline.svg", drawPipeline()],
  ["ore-ratio-distribution.svg", drawOreRatio(aggregates)],
  ["throttled-detection.svg", drawThrottledDetection(aggregates)],
  ["detector-complementarity.svg", drawComplementarity(aggregates)],
];
for (const [name, svg] of figures) fs.writeFileSync(path.join(outDir, name), `${svg}\n`);
console.log(`wrote ${figures.length} figures to ${outDir}/`);
for (const g of aggregates.oreRatio.groups) {
  console.log(
    `  ${g.name}: ${g.n} sessions, ${g.above} at or above ${aggregates.oreRatio.threshold}`,
  );
}
const cohortNames = aggregates.throttledDetection.cohorts
  .map((c) => `${c.name} (n=${c.n})`)
  .join(", ");
console.log(`  throttled cohorts: ${cohortNames}`);
for (const d of aggregates.throttledDetection.detectors) {
  console.log(`  ${d.name}: caught ${d.caught.join(", ")}`);
}

// Every README states the corpus size, and a translation is exactly the kind of file that gets
// left behind. These claims are checked rather than trusted; CI runs this script on every push.
// The badge URL stays English in every language, so it is the one string worth matching on.
const readmes = fs.readdirSync(".").filter((f) => /^README(\.[\w-]+)?\.md$/.test(f));
const problems = [];
for (const file of readmes) {
  const body = fs.readFileSync(file, "utf8");
  const claimed = [...body.matchAll(/corpus-(\d+)%20labelled%20sessions/g)].map((m) =>
    Number(m[1]),
  );
  // The English README repeats the figure in prose, so check that too.
  if (file === "README.md") {
    claimed.push(
      ...[...body.matchAll(/\*\*(\d+) labelled sessions\*\*/g)].map((m) => Number(m[1])),
    );
  }
  if (claimed.length === 0) {
    problems.push(`${file}: states no corpus size`);
    continue;
  }
  const wrong = [...new Set(claimed.filter((c) => c !== aggregates.sessionCount))];
  if (wrong.length > 0) {
    problems.push(`${file}: says ${wrong.join(" and ")}, the data says ${aggregates.sessionCount}`);
  }
  // A language bar that points at a file nobody wrote is worse than no language bar.
  for (const [, target] of body.matchAll(/\]\((README(?:\.[\w-]+)?\.md)\)/g)) {
    if (!fs.existsSync(target)) problems.push(`${file}: links to ${target}, which does not exist`);
  }
}
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(
  `  corpus size ${aggregates.sessionCount} agrees across ${readmes.length} README file(s)`,
);
