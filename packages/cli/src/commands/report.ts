import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { buildReport } from "@jevcraft/eval-runner";
import { DecisionRecordSchema, SessionLabelSchema } from "@jevcraft/schema";
import { readRecords, resolveInputFiles } from "../io";

export interface ReportDeps {
  stderr?: (line: string) => void;
}

export const REPORT_USAGE =
  "usage: jevcraft report --decisions <file|dir> --labels <file|dir> [--out <file.md>] [--title <text>]";

async function loadAll<T>(paths: string[], parse: (raw: unknown, file: string) => T): Promise<T[]> {
  const out: T[] = [];
  for (const file of await resolveInputFiles(paths)) {
    for (const raw of await readRecords(file)) out.push(parse(raw, file));
  }
  return out;
}

export async function runReport(
  args: string[],
  deps: ReportDeps = {},
): Promise<{ outPath: string; markdown: string }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values } = parseArgs({
    args,
    options: {
      decisions: { type: "string" },
      labels: { type: "string" },
      out: { type: "string" },
      title: { type: "string" },
    },
  });
  if (values.decisions === undefined) throw new Error(`--decisions is required. ${REPORT_USAGE}`);
  if (values.labels === undefined) throw new Error(`--labels is required. ${REPORT_USAGE}`);

  const decisions = await loadAll([values.decisions], (raw, file) => {
    const parsed = DecisionRecordSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`invalid DecisionRecord in ${file}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  const labels = await loadAll([values.labels], (raw, file) => {
    const parsed = SessionLabelSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(`invalid SessionLabel in ${file}: ${parsed.error.message}`);
    return parsed.data;
  });

  const title = values.title ?? basename(values.decisions, extname(values.decisions));
  const markdown = buildReport({ title, decisions, labels });
  const outPath = values.out ?? join("reports", `${title}.md`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  stderr(`report written -> ${outPath}`);
  return { outPath, markdown };
}
