#!/usr/bin/env node
// Enforces datasets/ACCESS.md, because convention did not. Three times a threshold or a
// comparison in this project was shaped by data that was supposed to be measuring it, and in one
// afternoon the confirmation set was spent three more times on work the development split could
// have carried. A rule nobody can forget has to be checked by something other than the person
// who would forget it.
//
// What it checks, over every committed script:
//   - a script that reads a `spent` or `sealed` dataset must say why, with a marker comment
//   - the marker names the question the read is for, so the intent is in the file, not in a memory
//
//   // ACCESS: spent-ok <why this read is reporting rather than deciding>
//   // ACCESS: spend <the question this sealed set is being spent on>
//
// usage: node scripts/check-access.mjs
import fs from "node:fs";
import path from "node:path";

const cfg = JSON.parse(fs.readFileSync("datasets/access.json", "utf8"));
const restricted = Object.entries(cfg.datasets)
  .filter(([, v]) => v.status === "spent" || v.status === "sealed")
  .map(([pattern, v]) => ({
    pattern,
    status: v.status,
    // Patterns are literal paths or a single * inside the filename.
    re: new RegExp(pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\w-]*")),
  }));

const walk = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(mjs|ts)$/.test(e.name)) out.push(p);
  }
  return out;
};

const files = [...walk("scripts"), ...walk("packages")].filter(
  (f) => !f.includes("node_modules") && !f.endsWith("check-access.mjs"),
);

const problems = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const declared = /\/\/\s*ACCESS:\s*(spent-ok|spend)\s+\S/.test(text);
  for (const r of restricted) {
    if (!r.re.test(text)) continue;
    if (declared) continue;
    problems.push(
      `${file} reads ${r.status} data matching ${r.pattern} with no "// ACCESS:" marker saying why`,
    );
  }
}

// A sealed set that has already been used is a bookkeeping error, not a style one.
for (const [name, v] of Object.entries(cfg.datasets)) {
  if (v.status === "sealed" && (v.uses ?? []).length > 0) {
    problems.push(`${name} is marked sealed but records ${v.uses.length} use(s); flip it to spent`);
  }
}

if (problems.length > 0) {
  console.error("dataset access violations:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nSee datasets/ACCESS.md. Exploration belongs on the open development split.");
  process.exit(1);
}

const counts = Object.values(cfg.datasets).reduce((a, v) => {
  a[v.status] = (a[v.status] ?? 0) + 1;
  return a;
}, {});
console.log(
  `dataset access ok: ${Object.entries(counts)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ")}, ${files.length} scripts checked`,
);
if ((cfg.sealed ?? []).length === 0) {
  console.log("  no sealed dataset: nothing can be tested cleanly until new sessions are recorded");
}
