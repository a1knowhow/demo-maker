/**
 * Live recorder: use Playwright's official recording API (context._enableRecorder
 * with mode "recording" and recorderMode "api") to capture actions, then save as YAML/JSON.
 * See: https://playwright.dev/docs/codegen and playwright-core server/recorder.
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import type { DemoStep, Locator } from "./types";
import type { OurRecordedScenario } from "./recording-to-yaml";
import {
  composeRecordedOnlyScenario,
  parsedScenarioToYaml,
  recordingJsonToScenario,
  relativeImportPath,
  scenarioToYaml,
} from "./recording-to-yaml";
import {
  playwrightActionToDemoStep,
  type PlaywrightRecordedAction,
} from "./playwright-selector-to-locator";
import { applyBaseUrlOverride, loadEnvFile, resolveBaseUrlFromEnv } from "./env";
import { loadScenario } from "./load";
import { parseScenario } from "./parse";
import type { ParsedScenario } from "./types";
import type { RunContext } from "./types";
import { runScenarioOnExistingPage } from "./runner";

/** True if two locators refer to the same element (for merging type steps). */
function locatorEquals(a: Locator | undefined, b: Locator | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case "role":
      return b.kind === "role" && a.role === b.role && nameEquals(a.name, b.name);
    case "label":
      return b.kind === "label" && nameEquals(a.label, b.label);
    case "text":
      return b.kind === "text" && a.text === b.text;
    case "placeholder":
      return b.kind === "placeholder" && a.placeholder === b.placeholder;
    case "title":
      return b.kind === "title" && a.title === b.title;
    default:
      return false;
  }
}
function nameEquals(x: string | RegExp, y: string | RegExp): boolean {
  if (typeof x === "string" && typeof y === "string") {
    return x === y;
  }
  if (x instanceof RegExp && y instanceof RegExp) {
    return x.source === y.source && x.flags === y.flags;
  }
  return false;
}

/** Action payload from Playwright recorder (actionAdded event): { frame, action }. */
interface ActionInContext {
  frame?: { pageGuid?: string; framePath?: string[]; pageAlias?: string };
  action: PlaywrightRecordedAction & { name: string; selector?: string; text?: string; options?: string[] };
}

/** Signal payload from Playwright recorder (signalAdded event): { frame, signal }. */
interface SignalInContext {
  frame?: { pageGuid?: string };
  signal?: { name: string; url?: string };
}

export interface RecordOptions {
  saveTo: string;
  saveJson?: string;
  url?: string;
  cwd?: string;
  /** When set, load this scenario YAML, replay its steps, then start recording additional steps (merge on save). */
  continueFrom?: string;
  /** When set with continueFrom, replay with minimal delays (no video pacing). Ignored when not using continueFrom. */
  fast?: boolean;
  /** When set with continueFrom, path to .env-style file for auth and {{ variables }} during replay. */
  envFile?: string;
  /** When set with continueFrom, replay only steps 1..N (1-based inclusive). */
  endStep?: number;
}

/** Minimal delay overrides for replay when --fast is used with continue-from. */
const FAST_REPLAY_DELAYS = {
  step_delay_ms: 0,
  slow_mo_ms: 0,
  typing_delay_ms: 0,
  post_click_delay_ms: 0,
  navigate_hold_ms: 100,
  pre_action_delay_ms: 0,
} as const;

const END_WAIT_MS = 1000;

function buildAndSave(
  steps: DemoStep[],
  baseUrl: string,
  saveToPath: string,
  saveJsonPath: string | undefined,
  baseParsed?: ParsedScenario,
  continueFromPath?: string,
): void {
  const stepsWithEndWait: DemoStep[] = [
    ...steps,
    { action: "wait", timeout_ms: END_WAIT_MS },
  ];

  if (baseParsed && continueFromPath) {
    const name = basename(saveToPath, ".yaml").replace(/\.yml$/i, "") || "recorded-scenario";
    const importPath = relativeImportPath(saveToPath, continueFromPath);
    const composed = composeRecordedOnlyScenario(baseParsed, stepsWithEndWait, { importPath, name });
    const yamlContent = parsedScenarioToYaml(composed);
    mkdirSync(dirname(saveToPath), { recursive: true });
    writeFileSync(saveToPath, yamlContent, "utf-8");
    console.log("Saved YAML (imports base + recorded steps only):", saveToPath);
    if (saveJsonPath) {
      const scenario: OurRecordedScenario = {
        title: name,
        base_url: baseParsed.base_url,
        steps: stepsWithEndWait.map((s) => {
          const step: OurRecordedScenario["steps"][number] = { action: s.action };
          if (s.url !== undefined) step.url = s.url;
          if (s.locator !== undefined) step.locator = s.locator;
          if (s.value !== undefined) step.value = s.value;
          if (s.timeout_ms !== undefined) step.timeout_ms = s.timeout_ms;
          if (s.until !== undefined) step.until = s.until;
          if (s.url_pattern !== undefined) step.url_pattern = s.url_pattern;
          if (s.caption !== undefined) step.caption = s.caption;
          if (s.note !== undefined) step.note = s.note;
          return step;
        }),
      };
      mkdirSync(dirname(saveJsonPath), { recursive: true });
      writeFileSync(saveJsonPath, JSON.stringify(scenario, null, 2), "utf-8");
      console.log("Saved JSON:", saveJsonPath);
    }
    return;
  }

  const title = "recorded-scenario";
  const scenario: OurRecordedScenario = {
    title,
    base_url: baseUrl.startsWith("http") ? baseUrl : "http://localhost:2000",
    steps: stepsWithEndWait.map((s) => {
      const step: OurRecordedScenario["steps"][number] = { action: s.action };
      if (s.url !== undefined) step.url = s.url;
      if (s.locator !== undefined) step.locator = s.locator;
      if (s.value !== undefined) step.value = s.value;
      if (s.timeout_ms !== undefined) step.timeout_ms = s.timeout_ms;
      if (s.until !== undefined) step.until = s.until;
      if (s.url_pattern !== undefined) step.url_pattern = s.url_pattern;
      if (s.caption !== undefined) step.caption = s.caption;
      if (s.note !== undefined) step.note = s.note;
      return step;
    }),
  };

  const demoScenario = recordingJsonToScenario(JSON.stringify(scenario), {
    ...(scenario.base_url !== undefined ? { base_url: scenario.base_url } : {}),
  });
  demoScenario.video = { enabled: false, dir: "output/videos" };
  demoScenario.step_delay_ms = 500;
  demoScenario.slow_mo_ms = 100;
  demoScenario.typing_delay_ms = 50;
  demoScenario.post_click_delay_ms = 250;
  demoScenario.navigate_hold_ms = 2000;
  demoScenario.pre_action_delay_ms = 300;
  const yamlContent = scenarioToYaml(demoScenario);

  mkdirSync(dirname(saveToPath), { recursive: true });
  writeFileSync(saveToPath, yamlContent, "utf-8");
  console.log("Saved YAML:", saveToPath);

  if (saveJsonPath) {
    mkdirSync(dirname(saveJsonPath), { recursive: true });
    writeFileSync(saveJsonPath, JSON.stringify(scenario, null, 2), "utf-8");
    console.log("Saved JSON:", saveJsonPath);
  }
}

export async function runLiveRecord(options: RecordOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const saveToPath = resolve(cwd, options.saveTo);
  const saveJsonPath = options.saveJson ? resolve(cwd, options.saveJson) : undefined;
  const initialUrl = options.url ?? "http://localhost:2000";
  const continueFrom = options.continueFrom
    ? resolve(cwd, options.continueFrom)
    : undefined;

  console.log("Output paths (cwd:", cwd, "):");
  console.log("  YAML:", saveToPath);
  if (saveJsonPath) {
    console.log("  JSON:", saveJsonPath);
  }
  if (continueFrom) {
    console.log("  Continue from:", continueFrom);
  } else {
    console.log("  Initial URL:", initialUrl);
  }

  const steps: DemoStep[] = [];
  let baseUrl = initialUrl.startsWith("http") ? initialUrl : "http://localhost:2000";
  let isRecordingActive = !continueFrom;
  let baseParsed: ParsedScenario | undefined;

  if (continueFrom) {
    let content: string;
    try {
      content = readFileSync(continueFrom, "utf-8");
    } catch (e) {
      throw new Error(
        `Failed to read --continue-from file: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    try {
      baseParsed = parseScenario(content);
    } catch (e) {
      throw new Error(
        `Failed to parse --continue-from YAML: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  let envFromFile: Record<string, string> = {};
  if (options.envFile) {
    let envPath = resolve(cwd, options.envFile);
    if (!existsSync(envPath) && continueFrom) {
      const scenarioDir = dirname(continueFrom);
      const altPath = resolve(scenarioDir, options.envFile);
      if (existsSync(altPath)) {
        envPath = altPath;
      }
    }
    envFromFile = loadEnvFile(envPath);
  }

  if (baseParsed) {
    applyBaseUrlOverride(baseParsed, { envFromFile });
    baseUrl = baseParsed.base_url;
  } else {
    const resolved = resolveBaseUrlFromEnv(envFromFile);
    if (resolved) {
      baseUrl = resolved;
    }
  }

  const browser = await chromium.launch({ headless: false });
  try {
    const viewport = { width: 1280, height: 720 };
    const context = await browser.newContext({
      viewport,
      ...(continueFrom && baseParsed ? { baseURL: baseParsed.base_url } : {}),
    });

    // Use Playwright's official recording API: mode "recording" + recorderMode "api"
    // (no Inspector UI; actions are sent to our eventSink).
    const contextWithRecorder = context as typeof context & {
      _enableRecorder: (
        params: { mode: string; recorderMode: string },
        eventSink: {
          actionAdded?: (page: unknown, data: ActionInContext, code: string) => void;
          actionUpdated?: (page: unknown, data: ActionInContext, code: string) => void;
          signalAdded?: (page: unknown, data: SignalInContext) => void;
        }
      ) => Promise<void>;
    };

    await contextWithRecorder._enableRecorder(
      { mode: "recording", recorderMode: "api" },
      {
        actionAdded(_page, data: ActionInContext, code: string) {
          if (!isRecordingActive) return;
          const act = data?.action;
          if (!act?.name) return;
          const step = playwrightActionToDemoStep(act, code);
          if (step) {
            steps.push(step as DemoStep);
            console.log("[record]", act.name, "steps:", steps.length);
          }
        },
        actionUpdated(_page, data: ActionInContext, code: string) {
          if (!isRecordingActive) return;
          const act = data?.action;
          if (!act?.name || act.name !== "fill") return;
          const step = playwrightActionToDemoStep(act, code);
          if (!step || step.action !== "type" || step.value === undefined) {
            return;
          }
          const last = steps[steps.length - 1];
          if (last?.action === "type" && last.locator && step.locator && locatorEquals(last.locator, step.locator)) {
            last.value = step.value;
            console.log("[record] fill updated, value length:", step.value.length);
          }
        },
        signalAdded(_page, data: SignalInContext) {
          if (!isRecordingActive) return;
          const sig = data?.signal;
          if (sig?.name === "navigation" && sig.url) {
            try {
              const u = new URL(sig.url);
              const base = new URL(baseUrl);
              const url = u.origin === base.origin ? u.pathname + u.search : sig.url;
              steps.push({ action: "navigate", url });
              console.log("[record] navigate, steps:", steps.length);
            } catch {
              steps.push({ action: "navigate", url: sig.url });
              console.log("[record] navigate, steps:", steps.length);
            }
          }
        },
      }
    );

    const page = await context.newPage();

    if (continueFrom && baseParsed) {
      const scenarioToRun = loadScenario(continueFrom, { cwd });
      applyBaseUrlOverride(scenarioToRun, { envFromFile });
      const n = scenarioToRun.steps.length;

      let runContext: RunContext = { auth: { email: "", password: "" }, variables: {} };
      if (options.envFile) {
        const env: Record<string, string | undefined> = { ...process.env, ...envFromFile };
        const emailEnv = scenarioToRun.auth?.email_env ?? "E2E_TEST_USER_EMAIL";
        const passwordEnv = scenarioToRun.auth?.password_env ?? "E2E_TEST_USER_PASSWORD";
        const email = env[emailEnv];
        const password = env[passwordEnv];
        if (!email || !password) {
          let envPath = resolve(cwd, options.envFile);
          if (!existsSync(envPath) && continueFrom) {
            const scenarioDir = dirname(continueFrom);
            const altPath = resolve(scenarioDir, options.envFile);
            if (existsSync(altPath)) {
              envPath = altPath;
            }
          }
          const hint =
            Object.keys(envFromFile).length === 0
              ? `Env file resolved to: ${envPath} (file empty or not found).`
              : `Env file loaded from: ${envPath} but missing ${emailEnv} and/or ${passwordEnv}.`;
          throw new Error(
            `Missing credentials for replay. Set ${emailEnv} and ${passwordEnv} in env or --env-file. ${hint}`
          );
        }
        const envVars: Record<string, string> = {};
        if (typeof process !== "undefined" && process.env) {
          for (const [k, v] of Object.entries(process.env)) {
            if (typeof v === "string") envVars[k] = v;
          }
        }
        runContext = {
          auth: { email, password },
          variables: { ...envVars, ...envFromFile, BASE_URL: scenarioToRun.base_url },
        };
      }

      if (n === 0) {
        console.log("Base scenario has 0 steps. Recording is active from the start.");
        isRecordingActive = true;
      } else {
        let scenarioForReplay = options.fast
          ? { ...scenarioToRun, ...FAST_REPLAY_DELAYS }
          : scenarioToRun;
        const replayCount =
          options.endStep !== undefined
            ? Math.min(options.endStep, scenarioForReplay.steps.length)
            : scenarioForReplay.steps.length;
        if (options.endStep !== undefined) {
          console.log(`Replaying steps 1..${replayCount} (--end-step).`);
        }
        if (options.fast) {
          console.log("Replay in fast mode (minimal delays).");
        }
        console.log(`Replaying ${replayCount} steps from base scenario...`);
        const runResult = await runScenarioOnExistingPage(
          page,
          scenarioForReplay,
          runContext,
          { cwd, endStep: options.endStep }
        );
        if (!runResult.success) {
          throw new Error(
            `Replay failed: ${runResult.error ?? "unknown"}`
          );
        }
        try {
          const u = new URL(page.url());
          baseUrl = u.origin + u.pathname;
        } catch {
          baseUrl = baseParsed.base_url;
        }
        isRecordingActive = true;
        console.log(`Replayed ${replayCount} steps. Recording is now active; perform additional actions, then press Ctrl+C to save.`);
      }
    } else {
      await page.goto(initialUrl).catch(() => {});
      try {
        const u = new URL(page.url());
        baseUrl = u.origin + u.pathname;
        steps.push({ action: "navigate", url: u.pathname + u.search || "/" });
      } catch {
        baseUrl = initialUrl;
      }
    }

    console.log("Recording (Playwright recording mode). Interact with the page, then press Ctrl+C to stop and save.");
    const logSteps = () => console.log("Recorded steps so far:", steps.length);
    logSteps();
    const interval = setInterval(logSteps, 3000);
    await new Promise<void>((resolvePromise) => {
      const onExit = () => {
        clearInterval(interval);
        process.off("SIGINT", onExit);
        process.off("SIGTERM", onExit);
        console.log("Stopping... recorded", steps.length, "steps. Saving to", saveToPath);
        try {
          buildAndSave(steps, baseUrl, saveToPath, saveJsonPath, baseParsed, continueFrom);
        } catch (e) {
          console.error("Save failed:", e instanceof Error ? e.message : e);
        }
        resolvePromise();
      };
      process.on("SIGINT", onExit);
      process.on("SIGTERM", onExit);
    });
  } finally {
    await browser.close();
  }
}
