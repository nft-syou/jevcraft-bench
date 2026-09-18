import { EVALUATE_USAGE, runEvaluate } from "./commands/evaluate";

const USAGE = `jevcraft <command>

commands:
  evaluate   ${EVALUATE_USAGE}
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "evaluate":
      await runEvaluate(rest);
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
