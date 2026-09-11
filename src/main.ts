/**
 * Unified CLI: demo-maker <run|check|record|import|export-chapters> ...
 */

import { runMain } from "./cli";
import { recordMain } from "./record-cli";
import { exportChaptersMain } from "./export-chapters";

function printHelp(): void {
  console.log(`demo-maker — demo videos as code (YAML + Playwright → MP4)

Usage:
  demo-maker run <scenario.yaml> [options]
  demo-maker check <scenario.yaml> [options]   # same as run --fail-fast --fast
  demo-maker record [options]
  demo-maker import <recording.json> -o <scenario.yaml>
  demo-maker export-chapters <timing.json|dir>

Run options include:
  --env-file=PATH  --base-url=URL  --headless  --fast  --fail-fast
  --end-step=N  --pause-at-end  --storage-state=PATH  --save-storage-state=PATH
  --debug-dir=PATH  --capture-from-url VAR=regex  --url-capture-file=path.json

Requires: Node 20+, Playwright Chromium, ffmpeg on PATH for MP4/splice.
`);
}

export async function main(argv: string[] = process.argv): Promise<number> {
  const args = argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    printHelp();
    return cmd ? 0 : 1;
  }

  if (cmd === "run") {
    return runMain(["node", "demo-maker", ...args.slice(1)]);
  }
  if (cmd === "check") {
    return runMain(["node", "demo-maker", ...args.slice(1), "--fail-fast", "--fast"]);
  }
  if (cmd === "record") {
    return recordMain(["node", "demo-maker", ...args.slice(1)]);
  }
  if (cmd === "import") {
    return recordMain(["node", "demo-maker", "--import", ...args.slice(1)]);
  }
  if (cmd === "export-chapters") {
    return exportChaptersMain(["node", "demo-maker", ...args.slice(1)]);
  }

  // Back-compat: first arg is a yaml path (old ui script style)
  if (cmd.endsWith(".yaml") || cmd.endsWith(".yml")) {
    return runMain(argv);
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
