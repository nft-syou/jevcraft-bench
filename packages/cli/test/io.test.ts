import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRecords, resolveInputFiles, writeJsonl } from "../src/io";

const dir = mkdtempSync(join(tmpdir(), "jevcraft-io-"));

describe("io", () => {
  it("reads a single json object as one record", async () => {
    const file = join(dir, "one.json");
    writeFileSync(file, JSON.stringify({ a: 1 }));
    expect(await readRecords(file)).toEqual([{ a: 1 }]);
  });

  it("reads a json array as many records", async () => {
    const file = join(dir, "many.json");
    writeFileSync(file, JSON.stringify([{ a: 1 }, { a: 2 }]));
    expect(await readRecords(file)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reads jsonl line by line and skips blank lines", async () => {
    const file = join(dir, "rows.jsonl");
    writeFileSync(file, '{"a":1}\n\n{"a":2}\n');
    expect(await readRecords(file)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("writes jsonl and creates parent directories", async () => {
    const file = join(dir, "nested/out.jsonl");
    await writeJsonl(file, [{ a: 1 }, { b: 2 }]);
    expect(readFileSync(file, "utf8")).toBe('{"a":1}\n{"b":2}\n');
  });

  it("expands directories to their json/jsonl files in sorted order", async () => {
    const sub = join(dir, "inputs");
    await writeJsonl(join(sub, "b.jsonl"), [{}]);
    writeFileSync(join(sub, "a.json"), "{}");
    writeFileSync(join(sub, "README.md"), "ignored");
    const files = await resolveInputFiles([sub, join(dir, "one.json")]);
    expect(files).toEqual([join(sub, "a.json"), join(sub, "b.jsonl"), join(dir, "one.json")]);
  });
});
