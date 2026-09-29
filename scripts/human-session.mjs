#!/usr/bin/env node
// Writes the manifest entry for one session played by a person, so `jevcraft label-runs` can
// label it the same way it labels a bot run. Start it before joining the server, play, leave the
// server, then press Enter here.
//
// The label is what the player says they did. Nothing in the telemetry is used to decide it.
//
// usage: node scripts/human-session.mjs --name <minecraft name> --kind <kind> [--out <manifest.jsonl>] [--note <text>]
//   kinds: legit-branch, legit-cave, xray-direct, xray-detour, xray-throttled, xray-free
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import { parseArgs } from "node:util";

const KINDS = {
  "legit-branch": { label: "legit", subtype: "branch_mining", tool: "no x-ray tooling" },
  "legit-cave": { label: "legit", subtype: "cave_mining", tool: "no x-ray tooling" },
  // Go straight to each ore.
  "xray-direct": { label: "known_cheat", subtype: "direct_xray", tool: "x-ray in use" },
  // Wander or take a side turn before each ore, to avoid a straight line.
  "xray-detour": { label: "known_cheat", subtype: "detour_xray", tool: "x-ray in use" },
  // Dig ordinary tunnel between ores so the ore rate looks unremarkable.
  "xray-throttled": { label: "known_cheat", subtype: "throttled_xray", tool: "x-ray in use" },
  // Whatever the player would do to avoid being caught; no instruction given.
  "xray-free": { label: "known_cheat", subtype: "mixed", tool: "x-ray in use" },
};

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    kind: { type: "string" },
    out: { type: "string" },
    note: { type: "string" },
  },
});
const kind = KINDS[values.kind];
if (!values.name || !kind) {
  console.error(
    `usage: node scripts/human-session.mjs --name <minecraft name> --kind <${Object.keys(KINDS).join("|")}>`,
  );
  process.exit(1);
}
const secret = process.env.JEVCRAFT_HMAC_SECRET ?? "change-me-local-only";
const out = values.out ?? `datasets/recordings/human-${values.name}.jsonl`;

// The same two mappings the server and the plugin apply: an offline-mode UUID from the name,
// then the keyed hash the plugin writes in place of it.
const h = createHash("md5").update(`OfflinePlayer:${values.name}`, "utf8").digest();
h[6] = (h[6] & 0x0f) | 0x30;
h[8] = (h[8] & 0x3f) | 0x80;
const x = h.toString("hex");
const uuid = `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
const playerId = `hmac-sha256:${createHmac("sha256", secret).update(uuid, "utf8").digest("hex")}`;

const joinedAt = new Date().toISOString();
console.log(`${values.kind} as ${values.name}, started ${joinedAt}`);
console.log("Join the server and play. Leave the server when done, then press Enter here.");

const rl = readline.createInterface({ input: process.stdin });
rl.once("line", () => {
  const leftAt = new Date().toISOString();
  const minutes = (Date.parse(leftAt) - Date.parse(joinedAt)) / 60000;
  fs.appendFileSync(
    out,
    `${JSON.stringify({
      botName: "human",
      uuid,
      playerId,
      scenario: `human-${values.kind}`,
      label: kind.label,
      subtype: kind.subtype,
      seed: 0,
      humanNoise: 1,
      origin: { x: 0, y: 0, z: 0 },
      joinedAt,
      leftAt,
      notes: [`played by a person; ${kind.tool}`, ...(values.note ? [values.note] : [])],
    })}\n`,
  );
  console.log(`${minutes.toFixed(1)} minutes -> ${out}`);
  rl.close();
});
