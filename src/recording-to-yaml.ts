/**
 * Convert recorded JSON (our recorder format or Puppeteer Replay / Chrome DevTools Recorder)
 * to demo-maker YAML scenario.
 */

import { stringify as yamlStringify } from "yaml";
import { dirname, relative } from "path";
import type { DemoScenario, DemoStep, Locator, ParsedScenario, StepOrImport } from "./types";
import { replaySelectorsToLocator } from "./selector-to-locator";

/** Scenario with steps that may include import directives; used when merging base YAML + recorded steps. */
export type MergedScenario = Omit<ParsedScenario, "steps"> & { steps: StepOrImport[] };

/** Our recorder's JSON shape: steps already in demo-maker style. */
export interface OurRecordedScenario {
  title: string;
  base_url?: string;
  steps: Array<{
    action: string;
    url?: string;
    locator?: Locator;
    value?: string;
    timeout_ms?: number;
    until?: string;
    url_pattern?: string;
    caption?: string;
    note?: string;
  }>;
}

/** Replay step (subset we care about). */
interface ReplayStep {
  type: string;
  url?: string;
  selectors?: string[];
  value?: string;
  timeout?: number;
  operator?: string;
  count?: number;
  visible?: boolean;
}

/** Replay UserFlow. */
interface ReplayUserFlow {
  title?: string;
  steps?: ReplayStep[];
}

const OUR_ACTIONS = new Set(["navigate", "click", "type", "fill", "wait", "expect_visible", "pause"]);
const REPLAY_NAVIGATE = "navigate";
const REPLAY_CLICK = "click";
const REPLAY_DOUBLE_CLICK = "doubleClick";
const REPLAY_CHANGE = "change";
const REPLAY_WAIT_FOR_ELEMENT = "waitForElement";

function isOurFormat(obj: unknown): obj is OurRecordedScenario {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.steps)) {
    return false;
  }
  return (o.steps as unknown[]).every(
    (s) => s && typeof s === "object" && typeof (s as Record<string, unknown>).action === "string"
  );
}

function isReplayFormat(obj: unknown): obj is ReplayUserFlow {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.steps)) {
    return false;
  }
  return (o.steps as unknown[]).every(
    (s) => s && typeof s === "object" && typeof (s as Record<string, unknown>).type === "string"
  );
}

function replayStepToDemoStep(step: ReplayStep, baseUrl: string): DemoStep | null {
  const type = step.type;
  if (type === REPLAY_NAVIGATE && typeof step.url === "string") {
    let url = step.url;
    try {
      const u = new URL(url);
      if (baseUrl && u.origin === new URL(baseUrl).origin) {
        url = u.pathname + u.search;
      }
    } catch {
      // leave url as-is
    }
    return { action: "navigate", url };
  }
  if (type === REPLAY_CLICK || type === REPLAY_DOUBLE_CLICK) {
    const result = replaySelectorsToLocator(step.selectors ?? []);
    if (!result) {
      return null;
    }
    const stepOut: DemoStep = { action: "click", locator: result.locator };
    if (result.note) {
      stepOut.note = result.note;
    }
    return stepOut;
  }
  if (type === REPLAY_CHANGE) {
    const result = replaySelectorsToLocator(step.selectors ?? []);
    if (!result) {
      return null;
    }
    const stepOut: DemoStep = {
      action: "type",
      locator: result.locator,
      value: typeof step.value === "string" ? step.value : "",
    };
    if (result.note) {
      stepOut.note = result.note;
    }
    return stepOut;
  }
  if (type === REPLAY_WAIT_FOR_ELEMENT) {
    const result = replaySelectorsToLocator(step.selectors ?? []);
    if (!result) {
      return null;
    }
    const stepOut: DemoStep = { action: "expect_visible", locator: result.locator };
    if (result.note) {
      stepOut.note = result.note;
    }
    return stepOut;
  }
  return null;
}

function ourStepToDemoStep(raw: OurRecordedScenario["steps"][0]): DemoStep | null {
  const action = raw.action;
  if (!OUR_ACTIONS.has(action)) {
    return null;
  }
  const step: DemoStep = { action: action as DemoStep["action"] };
  if (raw.url !== undefined) {
    step.url = raw.url;
  }
  if (raw.locator !== undefined) {
    step.locator = raw.locator;
  }
  if (raw.value !== undefined) {
    step.value = raw.value;
  }
  if (raw.timeout_ms !== undefined) {
    step.timeout_ms = raw.timeout_ms;
  }
  if (raw.until !== undefined) {
    step.until = raw.until as "url";
  }
  if (raw.url_pattern !== undefined) {
    step.url_pattern = raw.url_pattern;
  }
  if (raw.caption !== undefined) {
    step.caption = raw.caption;
  }
  if (raw.note !== undefined) {
    step.note = raw.note;
  }
  return step;
}

/**
 * Parse JSON content (our format or Replay) and return a DemoScenario.
 */
export function recordingJsonToScenario(
  jsonContent: string,
  options: { base_url?: string } = {}
): DemoScenario {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const base_url = options.base_url ?? "http://localhost:2000";
  let name = "recorded-scenario";
  let description = "";
  const steps: DemoStep[] = [];

  let resolvedBaseUrl = base_url;
  if (isOurFormat(parsed)) {
    name = parsed.title?.trim() || name;
    if (parsed.base_url && options.base_url === undefined) {
      resolvedBaseUrl = parsed.base_url;
    }
    for (const raw of parsed.steps) {
      const step = ourStepToDemoStep(raw);
      if (step) {
        steps.push(step);
      }
    }
  } else if (isReplayFormat(parsed)) {
    const flow = parsed as ReplayUserFlow;
    name = flow.title?.trim() || name;
    const base = options.base_url ?? base_url;
    for (const replayStep of flow.steps ?? []) {
      const step = replayStepToDemoStep(replayStep, base);
      if (step) {
        steps.push(step);
      }
    }
  } else {
    throw new Error("Unknown recording format: expected our format or Puppeteer Replay UserFlow");
  }

  return {
    name,
    description,
    base_url: resolvedBaseUrl,
    steps,
  };
}

/**
 * Serialize DemoScenario to YAML string.
 */
export function scenarioToYaml(scenario: DemoScenario): string {
  const obj: Record<string, unknown> = {
    name: scenario.name,
    ...(scenario.title !== undefined && scenario.title.trim() ? { title: scenario.title } : {}),
    description: scenario.description,
    base_url: scenario.base_url,
    ...(scenario.video !== undefined ? { video: scenario.video } : {}),
    ...(scenario.step_delay_ms !== undefined ? { step_delay_ms: scenario.step_delay_ms } : {}),
    ...(scenario.slow_mo_ms !== undefined ? { slow_mo_ms: scenario.slow_mo_ms } : {}),
    ...(scenario.typing_delay_ms !== undefined ? { typing_delay_ms: scenario.typing_delay_ms } : {}),
    ...(scenario.post_click_delay_ms !== undefined ? { post_click_delay_ms: scenario.post_click_delay_ms } : {}),
    ...(scenario.navigate_hold_ms !== undefined ? { navigate_hold_ms: scenario.navigate_hold_ms } : {}),
    ...(scenario.pre_action_delay_ms !== undefined ? { pre_action_delay_ms: scenario.pre_action_delay_ms } : {}),
    steps: scenario.steps.map((s) => {
      const step: Record<string, unknown> = { action: s.action };
      if (s.caption !== undefined) {
        step.caption = s.caption;
      }
      if (s.url !== undefined) {
        step.url = s.url;
      }
      if (s.locator !== undefined) {
        step.locator = locatorToPlain(s.locator);
      }
      if (s.value !== undefined) {
        step.value = s.value;
      }
      if (s.timeout_ms !== undefined) {
        step.timeout_ms = s.timeout_ms;
      }
      if (s.until !== undefined) {
        step.until = s.until;
      }
      if (s.url_pattern !== undefined) {
        step.url_pattern = s.url_pattern;
      }
      if (s.note !== undefined) {
        step.note = s.note;
      }
      return step;
    }),
  };
  let out = yamlStringify(obj, { lineWidth: 0 });
  const delayComments: Array<{ key: string; comment: string }> = [
    { key: "step_delay_ms", comment: "# Delay after each step (pacing)" },
    { key: "slow_mo_ms", comment: "# Delay after each browser action (smoother motion)" },
    { key: "typing_delay_ms", comment: "# Delay between keystrokes (human-like typing)" },
    { key: "post_click_delay_ms", comment: "# Delay after click (show result before next)" },
    { key: "navigate_hold_ms", comment: "# Wait after navigate (hold on new page)" },
    { key: "pre_action_delay_ms", comment: "# Delay before navigate/click (video: more frames of current page)" },
  ];
  for (const { key, comment } of delayComments) {
    out = out.replace(new RegExp(`\\n(${key}:)`, "g"), `\n${comment}\n$1`);
  }
  return out;
}

function isStepImport(s: StepOrImport): s is { import: string } {
  return typeof s === "object" && s !== null && "import" in s && typeof (s as { import: string }).import === "string";
}

function stepOrImportToPlain(s: StepOrImport): Record<string, unknown> {
  if (isStepImport(s)) {
    return { import: s.import };
  }
  const step: Record<string, unknown> = { action: s.action };
  if (s.caption !== undefined) {
    step.caption = s.caption;
  }
  if (s.url !== undefined) {
    step.url = s.url;
  }
  if (s.locator !== undefined) {
    step.locator = locatorToPlain(s.locator);
  }
  if (s.value !== undefined) {
    step.value = s.value;
  }
  if (s.timeout_ms !== undefined) {
    step.timeout_ms = s.timeout_ms;
  }
  if (s.until !== undefined) {
    step.until = s.until;
  }
  if (s.url_pattern !== undefined) {
    step.url_pattern = s.url_pattern;
  }
  if (s.note !== undefined) {
    step.note = s.note;
  }
  return step;
}

/**
 * Default pacing for newly saved recorded scenarios (continue-from and live record).
 */
export const RECORDED_SCENARIO_PACING = {
  step_delay_ms: 500,
  slow_mo_ms: 100,
  typing_delay_ms: 50,
  post_click_delay_ms: 250,
  navigate_hold_ms: 2000,
  pre_action_delay_ms: 300,
} as const;

/** Import path for YAML `imports:` relative to the saved scenario file. */
export function relativeImportPath(saveToPath: string, continueFromPath: string): string {
  const rel = relative(dirname(saveToPath), continueFromPath);
  return rel.split("\\").join("/");
}

/**
 * Build a scenario YAML that references the replayed base via `imports` and contains
 * only newly recorded steps (not inlined base steps).
 */
export function composeRecordedOnlyScenario(
  base: ParsedScenario,
  extraSteps: DemoStep[],
  opts: { importPath: string; name: string },
): MergedScenario {
  return {
    name: opts.name,
    description: "",
    base_url: base.base_url,
    imports: [opts.importPath],
    steps: extraSteps,
    ...RECORDED_SCENARIO_PACING,
  };
}

/**
 * Serialize a merged scenario (ParsedScenario with StepOrImport steps) to YAML.
 * Preserves top-level imports and step-level import directives.
 */
export function parsedScenarioToYaml(merged: MergedScenario): string {
  const obj: Record<string, unknown> = {
    name: merged.name,
  };
  if (merged.title !== undefined && merged.title.trim()) {
    obj.title = merged.title;
  }
  obj.description = merged.description;
  obj.base_url = merged.base_url;
  obj.steps = merged.steps.map((s) => stepOrImportToPlain(s));
  if (merged.imports !== undefined && merged.imports.length > 0) {
    obj.imports = merged.imports;
  }
  if (merged.seed_data !== undefined) {
    obj.seed_data = merged.seed_data;
  }
  if (merged.auth !== undefined) {
    obj.auth = merged.auth;
  }
  if (merged.video !== undefined) {
    obj.video = merged.video;
  }
  if (merged.step_delay_ms !== undefined) {
    obj.step_delay_ms = merged.step_delay_ms;
  }
  if (merged.slow_mo_ms !== undefined) {
    obj.slow_mo_ms = merged.slow_mo_ms;
  }
  if (merged.typing_delay_ms !== undefined) {
    obj.typing_delay_ms = merged.typing_delay_ms;
  }
  if (merged.post_click_delay_ms !== undefined) {
    obj.post_click_delay_ms = merged.post_click_delay_ms;
  }
  if (merged.navigate_hold_ms !== undefined) {
    obj.navigate_hold_ms = merged.navigate_hold_ms;
  }
  if (merged.pre_action_delay_ms !== undefined) {
    obj.pre_action_delay_ms = merged.pre_action_delay_ms;
  }
  let out = yamlStringify(obj, { lineWidth: 0 });
  const delayComments: Array<{ key: string; comment: string }> = [
    { key: "step_delay_ms", comment: "# Delay after each step (pacing)" },
    { key: "slow_mo_ms", comment: "# Delay after each browser action (smoother motion)" },
    { key: "typing_delay_ms", comment: "# Delay between keystrokes (human-like typing)" },
    { key: "post_click_delay_ms", comment: "# Delay after click (show result before next)" },
    { key: "navigate_hold_ms", comment: "# Wait after navigate (hold on new page)" },
    { key: "pre_action_delay_ms", comment: "# Delay before navigate/click (video: more frames of current page)" },
  ];
  for (const { key, comment } of delayComments) {
    out = out.replace(new RegExp(`\\n(${key}:)`, "g"), `\n${comment}\n$1`);
  }
  return out;
}

function locatorToPlain(loc: Locator): Record<string, unknown> {
  switch (loc.kind) {
    case "role":
      return {
        role: loc.role,
        name:
          loc.name instanceof RegExp ? `/${loc.name.source}/${loc.name.flags}` : loc.name,
      };
    case "label":
      return { label: loc.label instanceof RegExp ? `/${loc.label.source}/${loc.label.flags}` : loc.label };
    case "text":
      return { text: loc.text };
    case "placeholder":
      return { placeholder: loc.placeholder };
    case "title":
      return { title: loc.title };
    case "selector":
      return { selector: loc.selector };
    default:
      return {};
  }
}
