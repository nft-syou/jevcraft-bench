import { EVALUATE_USAGE, runEvaluate } from "./commands/evaluate";
import { EXTRACT_USAGE, runExtract } from "./commands/extract";
import { GENERATE_USAGE, runGenerate } from "./commands/generate";
import { LABEL_RUNS_USAGE, runLabelRuns } from "./commands/label-runs";
import { RECORD_USAGE, runRecord } from "./commands/record";
import { REPORT_USAGE, runReport } from "./commands/report";

const USAGE = `jevcraft <command>

commands:
  extract    ${EXTRACT_USAGE}
  evaluate   ${EVALUATE_USAGE}
  report     ${REPORT_USAGE}
  generate   ${GENERATE_USAGE}
  record     ${RECORD_USAGE}
  label-runs ${LABEL_RUNS_USAGE}
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "extract":
      await runExtract(rest);
      return 0;
    case "evaluate":
      await runEvaluate(rest);
      return 0;
    case "report":
      await runReport(rest);
      return 0;
    case "generate":
      await runGenerate(rest);
      return 0;
    case "record":
      await runRecord(rest);
      return 0;
    case "label-runs":
      await runLabelRuns(rest);
      return 0;
    default:
      console.error(USAGE);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
