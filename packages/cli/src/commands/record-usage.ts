// Kept apart from record.ts so the top-level usage text does not drag in @jevcraft/bot-recorder,
// which pulls the whole Mineflayer stack. That import is the difference between a 1.1 GB and a
// 0.4 GB analysis image, so main.ts loads the command itself only when it is actually run.
export const RECORD_USAGE =
  "usage: jevcraft record --scenario <name|all> [--count <n>] [--out <manifest.jsonl>] [--host 127.0.0.1] [--port 25565] [--version 26.1] [--budget-seconds 180] [--human-noise 0.5] [--seed 1] [--start-index 0] [--parallel 1]";
