/**
 * Parse scenario YAML into typed DemoScenario. No variable substitution; leave {{ }} as-is.
 */

import { parse as parseYaml } from "yaml";
import type {
  ActionType,
  AudioConfig,
  AuthConfig,
  DemoStep,
  Locator,
  ParsedScenario,
  ScreenshotConfig,
  StepImport,
  StepOrImport,
  UrlCaptureRule,
  VideoConfig,
} from "./types";
import {
  describeInvalidLocator,
  formatStepParseError,
  type ParseScenarioContext,
} from "./parse-errors";

export interface ParseScenarioOptions {
  /** Path to the YAML file (shown in validation errors). */
  sourceFile?: string;
}

const ACTION_TYPES: ActionType[] = [
  "navigate",
  "click",
  "type",
  "fill",
  "wait",
  "expect_visible",
  "pause",
  "log",
  "screenshot",
  "title_card",
  "transition",
  "repeat_while_visible",
  "cut_video",
  "drag",
];

function parseLocatorName(value: unknown): string | RegExp {
  if (value instanceof RegExp) {
    return value;
  }
  if (typeof value !== "string") {
    return String(value ?? "");
  }
  // String that looks like /pattern/flags -> RegExp
  const match = value.match(/^\/(.+)\/([gimsuy]*)$/);
  if (match) {
    try {
      return new RegExp(match[1]!, match[2] ?? undefined);
    } catch {
      return value;
    }
  }
  return value;
}

function mapLocator(raw: unknown): Locator | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.role === "string") {
    const name = obj.name === undefined ? "" : parseLocatorName(obj.name);
    return { kind: "role", role: obj.role, name };
  }
  if (typeof obj.label !== "undefined") {
    return { kind: "label", label: parseLocatorName(obj.label) };
  }
  if (typeof obj["aria-label"] === "string") {
    return { kind: "label", label: parseLocatorName(obj["aria-label"]) };
  }
  if (typeof obj.text === "string") {
    return { kind: "text", text: obj.text };
  }
  if (typeof obj.placeholder === "string") {
    return { kind: "placeholder", placeholder: obj.placeholder };
  }
  if (typeof obj.title === "string") {
    return { kind: "title", title: obj.title };
  }
  if (typeof obj.selector === "string") {
    return { kind: "selector", selector: obj.selector };
  }
  return undefined;
}

function stepError(
  ctx: ParseScenarioContext,
  index: number,
  message: string,
  raw?: Record<string, unknown>
): Error {
  return new Error(formatStepParseError(ctx, index, message, raw));
}

function mapStep(raw: unknown, index: number, ctx: ParseScenarioContext): DemoStep {
  if (!raw || typeof raw !== "object") {
    throw stepError(ctx, index, "expected an object", undefined);
  }
  const obj = raw as Record<string, unknown>;

  const action = obj.action;
  if (typeof action !== "string" || !ACTION_TYPES.includes(action as ActionType)) {
    throw stepError(
      ctx,
      index,
      `invalid action "${String(action)}". Must be one of: ${ACTION_TYPES.join(", ")}`,
      obj
    );
  }

  const step: DemoStep = {
    action: action as ActionType,
  };

  if (typeof obj.caption === "string") {
    if (obj.caption.trim() === "") {
      throw stepError(ctx, index, "caption must be non-empty when set", obj);
    }
    step.caption = obj.caption;
  }
  if (obj.caption_style === "chapter" || obj.caption_style === "default") {
    step.caption_style = obj.caption_style;
  }
  if (typeof obj.url === "string") {
    step.url = obj.url;
  }
  if (typeof obj.value === "string") {
    step.value = obj.value;
  }
  if (typeof obj.note === "string") {
    step.note = obj.note;
  }
  if (typeof obj.message === "string") {
    step.message = obj.message;
  }
  if (typeof obj.text === "string") {
    step.text = obj.text;
  }
  if (typeof obj.hold_ms === "number") {
    step.hold_ms = obj.hold_ms;
  }
  if (typeof obj.fade_ms === "number") {
    step.fade_ms = obj.fade_ms;
  }
  if (obj.screenshot !== undefined) {
    if (step.action !== "screenshot") {
      throw stepError(ctx, index, 'screenshot is only allowed on action "screenshot"', obj);
    }
    if (!obj.screenshot || typeof obj.screenshot !== "object") {
      throw stepError(ctx, index, "screenshot must be an object", obj);
    }
    const sc = obj.screenshot as Record<string, unknown>;
    const screenshot: DemoStep["screenshot"] = {};
    if (typeof sc.file === "string" && sc.file.trim()) {
      screenshot.file = sc.file.trim();
    }
    if (sc.full_page === true) {
      screenshot.full_page = true;
    }
    if (sc.omit_background === true) {
      screenshot.omit_background = true;
    }
    if (sc.scale === "css" || sc.scale === "device") {
      screenshot.scale = sc.scale;
    } else if (sc.scale !== undefined) {
      throw stepError(ctx, index, 'screenshot.scale must be "css" or "device"', obj);
    }
    step.screenshot = screenshot;
  }
  if (typeof obj.timeout_ms === "number") {
    step.timeout_ms = obj.timeout_ms;
  }
  if (obj.until === "url") {
    step.until = "url";
    if (typeof obj.url_pattern === "string") {
      step.url_pattern = obj.url_pattern;
    }
  }
  if (obj.until === "hidden") {
    step.until = "hidden";
  }
  if (typeof obj.refresh_every_ms === "number") {
    step.refresh_every_ms = obj.refresh_every_ms;
  }
  if (typeof obj.offset_x === "number") {
    step.offset_x = obj.offset_x;
  }
  if (typeof obj.offset_y === "number") {
    step.offset_y = obj.offset_y;
  }

  const locator = mapLocator(obj.locator);
  if (locator) {
    step.locator = locator;
  }

  if (obj.select_confirm === true) {
    step.select_confirm = true;
  }

  if (obj.clear_before_type === false) {
    if (step.action !== "type") {
      throw stepError(ctx, index, 'clear_before_type: false is only allowed on action "type"', obj);
    }
    step.clear_before_type = false;
  }

  if (typeof obj.typing_delay_ms === "number") {
    if (step.action !== "type") {
      throw stepError(ctx, index, 'typing_delay_ms is only allowed on action "type"', obj);
    }
    if (obj.typing_delay_ms < 0) {
      throw stepError(ctx, index, "typing_delay_ms must be >= 0", obj);
    }
    step.typing_delay_ms = obj.typing_delay_ms;
  }

  if (obj.steps !== undefined) {
    if (step.action !== "repeat_while_visible" && step.action !== "cut_video") {
      throw stepError(ctx, index, 'steps is only allowed on action "repeat_while_visible" or "cut_video"', obj);
    }
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
      throw stepError(
        ctx,
        index,
        step.action === "cut_video"
          ? 'cut_video requires a non-empty "steps" array'
          : 'repeat_while_visible requires a non-empty "steps" array',
        obj
      );
    }
    step.steps = obj.steps.map((s, j) => mapStep(s, index * 1000 + j + 1, ctx));
  }
  if (obj.placeholder !== undefined) {
    if (step.action !== "cut_video") {
      throw stepError(ctx, index, 'placeholder is only allowed on action "cut_video"', obj);
    }
    if (!obj.placeholder || typeof obj.placeholder !== "object") {
      throw stepError(ctx, index, "placeholder must be an object with action", obj);
    }
    const ph = mapStep(obj.placeholder, index * 1000 + 900, ctx);
    if (ph.action !== "title_card") {
      throw stepError(ctx, index, 'cut_video placeholder must use action "title_card"', obj);
    }
    step.placeholder = ph;
  }
  if (obj.video_exclude === true) {
    step.video_exclude = true;
  }
  if (typeof obj.max_iterations === "number") {
    if (step.action !== "repeat_while_visible") {
      throw stepError(ctx, index, 'max_iterations is only allowed on action "repeat_while_visible"', obj);
    }
    if (!Number.isInteger(obj.max_iterations) || obj.max_iterations < 1) {
      throw stepError(ctx, index, "max_iterations must be an integer >= 1", obj);
    }
    step.max_iterations = obj.max_iterations;
  }

  if (obj.settle_until !== undefined) {
    if (step.action !== "click") {
      throw stepError(ctx, index, 'settle_until is only allowed on action "click"', obj);
    }
    if (!obj.settle_until || typeof obj.settle_until !== "object") {
      throw stepError(ctx, index, 'settle_until must be an object with "text" or "locator"', obj);
    }
    const su = obj.settle_until as Record<string, unknown>;
    const textRaw = su.text;
    const hasText = typeof textRaw === "string" && textRaw.trim() !== "";
    const settleLoc = mapLocator(su.locator);
    const hasLoc = settleLoc !== undefined;
    if (hasText === hasLoc) {
      throw stepError(
        ctx,
        index,
        'settle_until requires exactly one of "text" (non-empty string) or "locator"',
        obj
      );
    }
    if (hasText) {
      step.settle_until = { text: (textRaw as string).trim() };
    } else {
      step.settle_until = { locator: settleLoc! };
    }
  }

  // Validation per action
  if (step.action === "navigate" && !step.url) {
    throw stepError(ctx, index, 'action "navigate" requires "url"', obj);
  }
  if (
    (step.action === "click" || step.action === "type" || step.action === "fill" || step.action === "expect_visible" || step.action === "drag") &&
    !step.locator
  ) {
    const locHint = describeInvalidLocator(obj.locator);
    const msg = locHint ?? `action "${step.action}" requires "locator"`;
    throw stepError(ctx, index, msg, obj);
  }
  if (step.action === "wait" && !step.until && step.timeout_ms === undefined) {
    throw stepError(ctx, index, 'action "wait" requires "until" with "url_pattern" or "locator", or "timeout_ms"', obj);
  }
  if (step.action === "wait" && step.until === "url" && !step.url_pattern) {
    throw stepError(ctx, index, 'action "wait" with until "url" requires "url_pattern"', obj);
  }
  if (step.action === "wait" && step.until === "hidden" && !step.locator) {
    throw stepError(ctx, index, 'action "wait" with until "hidden" requires "locator"', obj);
  }
  if (step.refresh_every_ms != null) {
    if (step.action !== "wait" || step.until !== "hidden") {
      throw stepError(
        ctx,
        index,
        'refresh_every_ms is only allowed on action "wait" with until "hidden"',
        obj
      );
    }
    if (!Number.isInteger(step.refresh_every_ms) || step.refresh_every_ms < 500) {
      throw stepError(ctx, index, "refresh_every_ms must be an integer >= 500", obj);
    }
  }
  if (step.action === "log" && !step.message) {
    throw stepError(ctx, index, 'action "log" requires "message"', obj);
  }
  if (step.action === "title_card" && (!step.text || step.text.trim() === "")) {
    throw stepError(ctx, index, 'action "title_card" requires non-empty "text"', obj);
  }
  if (step.action === "screenshot") {
    // screenshot can be page-level (no locator) or element-level (with locator)
    // screenshot options object is optional; defaults handled in runner
  }
  if (step.select_confirm && step.action !== "fill" && step.action !== "type") {
    throw stepError(ctx, index, 'select_confirm is only allowed on action "fill" or "type"', obj);
  }
  if (step.action === "repeat_while_visible") {
    if (!step.locator) {
      const locHint = describeInvalidLocator(obj.locator);
      throw stepError(ctx, index, locHint ?? 'repeat_while_visible requires "locator"', obj);
    }
    if (!step.steps || step.steps.length === 0) {
      throw stepError(ctx, index, 'repeat_while_visible requires a non-empty "steps" array', obj);
    }
  }
  if (step.action === "cut_video") {
    if (!step.steps || step.steps.length === 0) {
      throw stepError(ctx, index, 'cut_video requires a non-empty "steps" array', obj);
    }
  }
  if (step.video_exclude && step.action === "cut_video") {
    throw stepError(ctx, index, "video_exclude is not allowed on cut_video (nested steps are excluded automatically)", obj);
  }
  if (step.action === "drag") {
    if (typeof step.offset_x !== "number" || !Number.isFinite(step.offset_x)) {
      throw stepError(ctx, index, 'action "drag" requires numeric "offset_x"', obj);
    }
    if (step.offset_y === undefined) {
      step.offset_y = 0;
    } else if (!Number.isFinite(step.offset_y)) {
      throw stepError(ctx, index, 'action "drag" requires finite numeric "offset_y" when set', obj);
    }
  }

  return step;
}

function isStepImport(raw: unknown): raw is StepImport {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return typeof obj.import === "string" && obj.import.trim() !== "" && obj.action === undefined;
}

function mapStepOrImport(raw: unknown, index: number, ctx: ParseScenarioContext): StepOrImport {
  if (!raw || typeof raw !== "object") {
    throw stepError(ctx, index, "expected an object", undefined);
  }
  const obj = raw as Record<string, unknown>;
  if (isStepImport(obj)) {
    return { import: (obj.import as string).trim() };
  }
  return mapStep(raw, index, ctx);
}

function mapAuth(raw: unknown): AuthConfig | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.email_env !== "string" || typeof obj.password_env !== "string") {
    return undefined;
  }
  return { email_env: obj.email_env, password_env: obj.password_env };
}

function mapVideo(raw: unknown): VideoConfig | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const enabled = obj.enabled === true;
  const dir = typeof obj.dir === "string" ? obj.dir.trim() : "";
  if (!enabled || !dir) {
    return undefined;
  }

  const config: VideoConfig = { enabled: true, dir };
  if (typeof obj.filename === "string" && obj.filename.trim()) {
    config.filename = obj.filename.trim();
  }
  if (obj.size && typeof obj.size === "object" && typeof (obj.size as Record<string, unknown>).width === "number" && typeof (obj.size as Record<string, unknown>).height === "number") {
    const size = obj.size as { width: number; height: number };
    config.size = { width: size.width, height: size.height };
  }
  if (obj.viewport && typeof obj.viewport === "object" && typeof (obj.viewport as Record<string, unknown>).width === "number" && typeof (obj.viewport as Record<string, unknown>).height === "number") {
    const vp = obj.viewport as { width: number; height: number };
    config.viewport = { width: vp.width, height: vp.height };
  }
  if (typeof obj.start_step === "number" && obj.start_step >= 1) {
    config.start_step = obj.start_step;
  }
  if (typeof obj.end_step === "number" && obj.end_step >= 1) {
    config.end_step = obj.end_step;
  }
  if (obj.caption_parallel === true) {
    config.caption_parallel = true;
  }
  if (obj.playback_speed !== undefined) {
    if (
      typeof obj.playback_speed !== "number" ||
      !Number.isFinite(obj.playback_speed) ||
      obj.playback_speed <= 0 ||
      obj.playback_speed > 4
    ) {
      throw new Error("video.playback_speed must be a finite number > 0 and <= 4");
    }
    config.playback_speed = obj.playback_speed;
  }
  return config;
}

function mapAudio(raw: unknown): AudioConfig | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.background !== "string" || !obj.background.trim()) {
    return undefined;
  }
  return { background: obj.background.trim() };
}

function mapScreenshots(raw: unknown): ScreenshotConfig | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const dir = typeof obj.dir === "string" ? obj.dir.trim() : "";
  if (!dir) {
    return undefined;
  }
  return { dir };
}

function mapUrlCapture(raw: unknown): UrlCaptureRule[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new Error('"url_capture" must be an array of { variable, pattern }');
  }
  const rules: UrlCaptureRule[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      throw new Error(`url_capture[${i}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.variable !== "string" || !rec.variable.trim()) {
      throw new Error(`url_capture[${i}].variable must be a non-empty string`);
    }
    if (typeof rec.pattern !== "string" || !rec.pattern) {
      throw new Error(`url_capture[${i}].pattern must be a non-empty string (RegExp source)`);
    }
    try {
      // Validate pattern compiles
      void new RegExp(rec.pattern);
    } catch (err) {
      throw new Error(
        `url_capture[${i}].pattern is not a valid RegExp: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    rules.push({ variable: rec.variable.trim(), pattern: rec.pattern });
  }
  return rules.length > 0 ? rules : undefined;
}

/**
 * Parse YAML content into a ParsedScenario (steps may contain import directives).
 * Does not resolve variables; value/url may still contain {{ ... }}.
 * Use loadScenario to flatten imports and get a DemoScenario for the runner.
 */
export function parseScenario(yamlContent: string, options: ParseScenarioOptions = {}): ParsedScenario {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err) {
    throw new Error(
      `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Scenario YAML must be an object");
  }
  const obj = parsed as Record<string, unknown>;

  const name = obj.name;
  const steps = obj.steps;
  if (typeof name !== "string" || !name.trim()) {
    throw new Error('Scenario must have a non-empty "name"');
  }
  if (!Array.isArray(steps)) {
    throw new Error('Scenario must have "steps" as an array');
  }

  const stepEntries = steps.filter(
    (s): s is Record<string, unknown> =>
      s != null && typeof s === "object" && (typeof (s as Record<string, unknown>).action === "string" || isStepImport(s))
  );

  const parseCtx: ParseScenarioContext = {
    sourceFile: options.sourceFile,
    scenarioName: typeof name === "string" ? name.trim() : undefined,
  };

  const scenario: ParsedScenario = {
    name: name.trim(),
    description: typeof obj.description === "string" ? obj.description : "",
    base_url: typeof obj.base_url === "string" ? obj.base_url : "http://localhost:2000",
    steps: stepEntries.map((s, i) => mapStepOrImport(s, i, parseCtx)),
  };
  if (typeof obj.title === "string" && obj.title.trim()) {
    scenario.title = obj.title.trim();
  }

  if (obj.imports !== undefined) {
    if (!Array.isArray(obj.imports)) {
      throw new Error('"imports" must be an array of strings');
    }
    const importPaths = obj.imports.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean);
    if (importPaths.length > 0) {
      scenario.imports = importPaths;
    }
  }

  if (typeof obj.seed_data === "string") {
    scenario.seed_data = obj.seed_data;
  }
  const auth = mapAuth(obj.auth);
  if (auth) {
    scenario.auth = auth;
  }
  const video = mapVideo(obj.video);
  if (video) {
    scenario.video = video;
  }
  const screenshots = mapScreenshots(obj.screenshots);
  if (screenshots) {
    scenario.screenshots = screenshots;
  }
  const audio = mapAudio(obj.audio);
  if (audio) {
    scenario.audio = audio;
  }
  if (typeof obj.device_scale_factor === "number" && obj.device_scale_factor > 0) {
    scenario.device_scale_factor = obj.device_scale_factor;
  }
  if (typeof obj.step_delay_ms === "number" && obj.step_delay_ms >= 0) {
    scenario.step_delay_ms = obj.step_delay_ms;
  }
  if (typeof obj.slow_mo_ms === "number" && obj.slow_mo_ms >= 0) {
    scenario.slow_mo_ms = obj.slow_mo_ms;
  }
  if (typeof obj.typing_delay_ms === "number" && obj.typing_delay_ms >= 0) {
    scenario.typing_delay_ms = obj.typing_delay_ms;
  }
  if (typeof obj.post_click_delay_ms === "number" && obj.post_click_delay_ms >= 0) {
    scenario.post_click_delay_ms = obj.post_click_delay_ms;
  }
  if (typeof obj.navigate_hold_ms === "number" && obj.navigate_hold_ms >= 0) {
    scenario.navigate_hold_ms = obj.navigate_hold_ms;
  }
  if (typeof obj.pre_action_delay_ms === "number" && obj.pre_action_delay_ms >= 0) {
    scenario.pre_action_delay_ms = obj.pre_action_delay_ms;
  }
  if (typeof obj.action_timeout_ms === "number" && obj.action_timeout_ms > 0) {
    scenario.action_timeout_ms = obj.action_timeout_ms;
  }

  const meta = obj.metadata;
  if (meta !== undefined && meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    scenario.metadata = { ...(meta as Record<string, unknown>) };
  }

  const urlCapture = mapUrlCapture(obj.url_capture);
  if (urlCapture) {
    scenario.url_capture = urlCapture;
  }

  return scenario;
}
