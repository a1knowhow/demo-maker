/**
 * CLI for recording: live record, continue-from (replay then record), or import from JSON.
 * Usage:
 *   npm run demo:record -- --save-to path.yaml [--save-json path.json] [--url URL] [--base-url URL]
 *   npm run demo:record -- --continue-from scenario.yaml --save-to path.yaml [--save-json path.json] [--fast] [--env-file path]
 *   npm run demo:record -- --from recording.json --save-to scenario.yaml [--base-url URL]
 *   npm run demo:import -- recording.json -o scenario.yaml [--base-url URL]
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { runLiveRecord } from "./recorder";
import { recordingJsonToScenario, scenarioToYaml } from "./recording-to-yaml";

function failIfExists(cwd: string, filePath: string, label: string): boolean {
  const abs = resolve(cwd, filePath);
  if (existsSync(abs)) {
    console.error(`${label} already exists, refusing to overwrite:`, abs);
    console.error("Delete/rename the file, or choose a different output path.");
    return true;
  }
  return false;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const positionals = args.filter((a) => !a.startsWith("--"));
  const saveTo =
    args.find((a) => a.startsWith("--save-to="))?.slice("--save-to=".length) ??
    (args.includes("--save-to") && args[args.indexOf("--save-to") + 1] ? args[args.indexOf("--save-to") + 1] : undefined);
  const saveJson = args.find((a) => a.startsWith("--save-json="))?.slice("--save-json=".length);
  const url = args.find((a) => a.startsWith("--url="))?.slice("--url=".length);
  const from = args.find((a) => a.startsWith("--from="))?.slice("--from=".length);
  const continueFrom =
    args.find((a) => a.startsWith("--continue-from="))?.slice("--continue-from=".length) ??
    (args.includes("--continue-from") && args[args.indexOf("--continue-from") + 1]
      ? args[args.indexOf("--continue-from") + 1]
      : undefined);
  const fast = args.includes("--fast");
  const envFile =
    args.find((a) => a.startsWith("--env-file="))?.slice("--env-file=".length) ??
    (args.includes("--env-file") && args[args.indexOf("--env-file") + 1]
      ? args[args.indexOf("--env-file") + 1]
      : undefined);
  const baseUrl =
    args.find((a) => a.startsWith("--base-url="))?.slice("--base-url=".length) ??
    (args.includes("--base-url") && args[args.indexOf("--base-url") + 1]
      ? args[args.indexOf("--base-url") + 1]
      : undefined);
  const endStep =
    parsePositiveInt(args.find((a) => a.startsWith("--end-step="))?.slice("--end-step=".length)) ??
    (args.includes("--end-step") ? parsePositiveInt(args[args.indexOf("--end-step") + 1]) : undefined);
  const oEq = args.find((a) => a.startsWith("-o="));
  const oIdx = args.indexOf("-o");
  const output = oEq ? oEq.slice(3) : oIdx >= 0 && args[oIdx + 1] ? args[oIdx + 1] : undefined;
  const importMode = args.includes("--import");
  const jsonFile = importMode ? positionals[0] : from ?? undefined;
  return {
    saveTo,
    saveJson,
    url,
    from,
    baseUrl,
    continueFrom,
    fast,
    envFile,
    endStep,
    importMode,
    jsonFile,
    outFile: output,
  };
}

export async function recordMain(argv: string[] = process.argv): Promise<number> {
  const cwd = process.cwd();
  const { saveTo, saveJson, url, from, baseUrl, continueFrom, fast, envFile, endStep, importMode, jsonFile, outFile } =
    parseArgs(argv);

  const doImport = from || (importMode && jsonFile && outFile);
  if (doImport) {
    const jsonPath = from ?? jsonFile;
    if (!jsonPath) {
      console.error("Usage: demo:import <recording.json> -o <scenario.yaml> [--base-url URL]");
      return 1;
    }
    const outputPath = outFile ?? saveTo;
    if (!outputPath) {
      console.error("Usage: demo:import <recording.json> -o <scenario.yaml> [--base-url URL]");
      return 1;
    }
    if (failIfExists(cwd, outputPath, "Output YAML")) {
      return 1;
    }
    let jsonContent: string;
    try {
      jsonContent = readFileSync(resolve(cwd, jsonPath), "utf-8");
    } catch (e) {
      console.error("Failed to read JSON:", e instanceof Error ? e.message : e);
      return 1;
    }
    try {
      const scenario = recordingJsonToScenario(jsonContent, {
        ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
      });
      const yamlContent = scenarioToYaml(scenario);
      writeFileSync(resolve(cwd, outputPath), yamlContent, "utf-8");
      console.log("Import: saved YAML:", resolve(cwd, outputPath));
      return 0;
    } catch (e) {
      console.error("Failed to convert:", e instanceof Error ? e.message : e);
      return 1;
    }
  }

  if (!saveTo) {
    console.error("Usage (live record, opens browser):");
    console.error(
      "  npm run demo:record -- --save-to <path.yaml> [--save-json path.json] [--url URL] [--base-url URL]"
    );
    console.error("Usage (continue from existing YAML, replay then record):");
    console.error(
      "  npm run demo:record -- --continue-from <scenario.yaml> --save-to <path.yaml> [--save-json path.json] [--fast] [--env-file path] [--end-step N]"
    );
    console.error("Usage (import JSON to YAML, no browser):");
    console.error("  npm run demo:record -- --from <recording.json> --save-to <scenario.yaml> [--base-url URL]");
    console.error("  npm run demo:import -- <recording.json> -o <scenario.yaml> [--base-url URL]");
    return 1;
  }

  if (!continueFrom && failIfExists(cwd, saveTo, "Output YAML")) {
    return 1;
  }
  if (saveJson !== undefined && !continueFrom && failIfExists(cwd, saveJson, "Output JSON")) {
    return 1;
  }

  try {
    console.log(
      continueFrom
        ? "Starting recorder with replay (browser will open). Replay runs first, then recording. Press Ctrl+C to stop and save."
        : "Starting live recorder (browser will open). Press Ctrl+C to stop and save."
    );
    const recordOptions: Parameters<typeof runLiveRecord>[0] = { saveTo, cwd };
    if (saveJson !== undefined) {
      recordOptions.saveJson = saveJson;
    }
    if (url !== undefined) {
      recordOptions.url = url;
    } else if (baseUrl !== undefined) {
      recordOptions.url = baseUrl;
    }
    if (continueFrom !== undefined) {
      recordOptions.continueFrom = continueFrom;
    }
    if (fast) {
      recordOptions.fast = true;
    }
    if (envFile !== undefined) {
      recordOptions.envFile = envFile;
    }
    if (endStep !== undefined) {
      recordOptions.endStep = endStep;
    }
    await runLiveRecord(recordOptions);
    return 0;
  } catch (e) {
    console.error("Recording failed:", e instanceof Error ? e.message : e);
    return 1;
  }
}

