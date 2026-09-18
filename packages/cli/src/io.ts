import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function resolveInputFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const path of paths) {
    const info = await stat(path);
    if (info.isDirectory()) {
      const entries = (await readdir(path))
        .filter((name) => name.endsWith(".json") || name.endsWith(".jsonl"))
        .sort();
      for (const name of entries) files.push(join(path, name));
    } else {
      files.push(path);
    }
  }
  return files;
}

export async function readRecords(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  if (path.endsWith(".jsonl")) {
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as unknown);
  }
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(path, body.length > 0 ? `${body}\n` : "", "utf8");
}
