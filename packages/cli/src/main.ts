import { EVALUATE_USAGE, runEvaluate } from "./commands/evaluate";
import { GENERATE_USAGE, runGenerate } from "./commands/generate";
import { REPORT_USAGE, runReport } from "./commands/report";

const USAGE = `jevcraft <command>

commands:
  evaluate   ${EVALUATE_USAGE}
  report     ${REPORT_USAGE}
  generate   ${GENERATE_USAGE}
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "evaluate":
      await runEvaluate(rest);
      return 0;
    case "report":
      await runReport(rest);
      return 0;
    case "generate":
      await runGenerate(rest);
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
