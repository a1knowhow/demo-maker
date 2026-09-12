/**
 * CLI entry for `demo-maker run` / `demo-maker check`.
 * Loads variables from --env-file if given; builds RunContext from env, runs scenario.
 */

import { basename, resolve } from "path";
import {
  loadScenario,
  runScenario,
  createDemoLogger,
  type RunContext,
} from "./index";
import {
  applyBaseUrlOverride,
  buildRunVariables,
  collectFlatPlaceholderKeys,
  DEMO_BASE_URL_ENV_KEY,
  loadEnvFile,
} from "./env";
import {
  buildUrlCaptureHooks,
  loadUrlCaptureRulesFile,
  parseCaptureFromUrlArg,
  type UrlCaptureRule,
} from "./url-capture";

/** Minimal delay overrides when --fast is used (quick tests, no video pacing). */
const FAST_DELAYS = {
  step_delay_ms: 0,
  slow_mo_ms: 0,
  typing_delay_ms: 0,
  post_click_delay_ms: 0,
  navigate_hold_ms: 100,
  pre_action_delay_ms: 0,
} as const;

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseCaptureFromUrlArgs(args: string[]): UrlCaptureRule[] {
  const rules: UrlCaptureRule[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--capture-from-url=")) {
      rules.push(parseCaptureFromUrlArg(a.slice("--capture-from-url=".length)));
      continue;
    }
    if (a === "--capture-from-url") {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        rules.push(parseCaptureFromUrlArg(next));
        i++;
      }
    }
  }
  return rules;
}

function parseUrlCaptureFile(args: string[]): string | undefined {
  const eq = args.find((a) => a.startsWith("--url-capture-file="));
  if (eq) return eq.slice("--url-capture-file=".length);
  const idx = args.indexOf("--url-capture-file");
  if (idx >= 0) {
    const next = args[idx + 1];
    if (next && !next.startsWith("--")) return next;
  }
  return undefined;
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const positionals = args.filter((a) => !a.startsWith("--"));
  const scenarioPath = positionals[0];
  const baseUrl = args.find((a) => a.startsWith("--base-url="))?.slice("--base-url=".length);
  const headless = args.includes("--headless");
  const fast = args.includes("--fast");
  const failFast = args.includes("--fail-fast");
  const pauseAtEnd = args.includes("--pause-at-end");
  const envFile =
    args.find((a) => a.startsWith("--env-file="))?.slice("--env-file=".length) ?? positionals[1];
  const storageState = args.find((a) => a.startsWith("--storage-state="))?.slice("--storage-state=".length);
  const saveStorageState = args.find((a) => a.startsWith("--save-storage-state="))?.slice("--save-storage-state=".length);
  const debugDir = args.find((a) => a.startsWith("--debug-dir="))?.slice("--debug-dir=".length);
  const endStep =
    parsePositiveInt(args.find((a) => a.startsWith("--end-step="))?.slice("--end-step=".length)) ??
    (args.includes("--end-step") ? parsePositiveInt(args[args.indexOf("--end-step") + 1]) : undefined);
  const captureFromUrl = parseCaptureFromUrlArgs(args);
  const urlCaptureFile = parseUrlCaptureFile(args);
  return {
    scenarioPath,
    baseUrl,
    headless,
    fast,
    failFast,
    pauseAtEnd,
    envFile,
    storageState,
    saveStorageState,
    debugDir,
    endStep,
    captureFromUrl,
    urlCaptureFile,
  };
}

export async function runMain(argv: string[] = process.argv): Promise<number> {
  const logger = createDemoLogger("info");
  const {
    scenarioPath,
    baseUrl,
    headless,
    fast,
    failFast,
    pauseAtEnd,
    envFile,
    storageState,
    saveStorageState,
    debugDir,
    endStep,
    captureFromUrl,
    urlCaptureFile,
  } = parseArgs(argv);

  if (!scenarioPath) {
    logger.error(
      "Usage: demo-maker run <path-to-scenario.yaml> [env-file-path] [--base-url=URL] [--headless] [--fast] [--fail-fast] [--end-step=N] [--pause-at-end] [--debug-dir=path] [--env-file=path] [--storage-state=path] [--save-storage-state=path] [--capture-from-url VAR=regex] [--url-capture-file=path.json]"
    );
    return 1;
  }

  const resolvedPath = resolve(process.cwd(), scenarioPath);
  let scenario;
  try {
    scenario = loadScenario(resolvedPath, { cwd: process.cwd() });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to load scenario (${resolvedPath}):`, detail);
    return 1;
  }

  const envFromFile = envFile ? loadEnvFile(envFile) : {};
  applyBaseUrlOverride(scenario, { envFromFile, cliBaseUrl: baseUrl });
  logger.info(`Base URL: ${scenario.base_url}`);
  if (fast) {
    Object.assign(scenario, FAST_DELAYS);
    logger.info("Running in fast mode (minimal delays).");
  }

  if (failFast) {
    logger.info("Fail-fast enabled (stop on first step failure).");
  }
  const emailEnv = scenario.auth?.email_env ?? "E2E_TEST_USER_EMAIL";
  const passwordEnv = scenario.auth?.password_env ?? "E2E_TEST_USER_PASSWORD";
  const email = envFromFile[emailEnv] ?? process.env[emailEnv];
  const password = envFromFile[passwordEnv] ?? process.env[passwordEnv];

  if (scenario.auth && (!email || !password)) {
    logger.error(
      `Missing credentials. Set ${emailEnv} and ${passwordEnv} (in env or via --env-file).`
    );
    return 1;
  }

  const allowFromProcess = [
    emailEnv,
    passwordEnv,
    DEMO_BASE_URL_ENV_KEY,
    ...collectFlatPlaceholderKeys(JSON.stringify(scenario)),
  ];
  const context: RunContext = {
    auth: { email: email ?? "", password: password ?? "" },
    variables: buildRunVariables({
      envFromFile,
      baseUrl: scenario.base_url,
      allowFromProcess,
    }),
  };

  let urlCaptureHooks;
  try {
    const fileRules = urlCaptureFile
      ? loadUrlCaptureRulesFile(urlCaptureFile, process.cwd())
      : [];
    urlCaptureHooks = buildUrlCaptureHooks({
      scenarioRules: scenario.url_capture,
      cliRules: [...fileRules, ...captureFromUrl],
    });
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const stepCount = endStep ? Math.min(endStep, scenario.steps.length) : scenario.steps.length;
  logger.info(`Running scenario: ${scenario.name} (${stepCount}/${scenario.steps.length} steps)`);
  const scenarioLabel = basename(resolvedPath, ".yaml");
  const result = await runScenario(scenario, context, {
    logger,
    headless,
    storageStatePath: storageState,
    saveStorageStatePath: saveStorageState,
    failFast,
    endStep,
    pauseAtEnd,
    debugDir,
    scenarioLabel,
    urlCaptureHooks,
  });

  if (result.success) {
    logger.info("Scenario completed successfully.");
    if (result.videoPath) {
      logger.info("Video saved:", result.videoPath);
    }
    if (result.timingPath) {
      logger.info("Timing saved:", result.timingPath);
    }
    return 0;
  }
  logger.error("Scenario failed:", result.error);
  return 1;
}
