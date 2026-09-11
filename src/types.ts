/**
 * Domain types and interfaces for the demo-maker.
 * Self-contained under ui/demo-maker; not for consumption by the rest of the app.
 */

export type ActionType =
  | "navigate"
  | "click"
  | "type"
  | "fill"
  | "wait"
  | "expect_visible"
  | "pause"
  | "log"
  | "screenshot"
  | "title_card"
  | "transition"
  | "repeat_while_visible"
  | "cut_video"
  | "drag";

/** Caption overlay style when `caption:` is set on a step. */
export type CaptionStyle = "default" | "chapter";

export type Locator =
  | { kind: "role"; role: string; name: string | RegExp }
  | { kind: "label"; label: string | RegExp }
  | { kind: "text"; text: string }
  | { kind: "placeholder"; placeholder: string }
  | { kind: "title"; title: string }
  | { kind: "selector"; selector: string };

export interface AuthConfig {
  email_env: string;
  password_env: string;
}

/** Capture a path segment from the browser URL into a scenario variable. */
export interface UrlCaptureRule {
  /** Variable name for `{{ name }}` (e.g. workspace_id). */
  variable: string;
  /** RegExp source; the first capturing group is stored. */
  pattern: string;
}

/** Video recording options. When enabled, the run is recorded and saved to the given folder. */
export interface VideoConfig {
  /** Enable video recording for this scenario. Default false. */
  enabled: boolean;
  /** Output folder path for the recorded video (resolved relative to cwd when running). */
  dir: string;
  /** Optional output filename (e.g. "demo-login.webm"). If omitted, Playwright chooses the name. */
  filename?: string;
  /** Final output video resolution. Also used as the browser viewport unless `viewport` is set.
   *  Defaults to 1920x1080. */
  size?: { width: number; height: number };
  /** Browser viewport size during recording. Use this when the output `size` is larger than the
   *  physical screen (e.g. MacBook Retina ~1512 logical px wide). The browser renders at this
   *  smaller viewport, and ffmpeg upscales to `size` during the H.264 re-encode step.
   *  Defaults to `size` (no upscaling). */
  viewport?: { width: number; height: number };
  /** Optional 1-based start step (inclusive). When set with end_step, the recorded video is trimmed to this step range. E.g. skip login: start_step: 11, end_step: 15. */
  start_step?: number;
  /** Optional 1-based end step (inclusive). Use with start_step to trim the video. Requires ffmpeg. */
  end_step?: number;
  /**
   * When true, after showing a step `caption` the runner does not wait `caption_hold_ms` before the
   * next step — the caption fades out on a browser timer so automation can continue while it is visible.
   * Default false: legacy behavior (hold blocks until the caption duration elapses).
   */
  caption_parallel?: boolean;
  /** Playback speed multiplier for final MP4 (1 = normal). Applied during H.264 re-encode before audio mux. */
  playback_speed?: number;
}

/** Audio options mixed into the final video during the ffmpeg re-encode step. */
export interface AudioConfig {
  /** Path to a background music file (mp3/wav/aac). Resolved relative to cwd. Loops/trims to video length. */
  background: string;
}

export interface DemoScenario {
  name: string;
  /** Optional public / YouTube title; `name` stays the short internal id for CLI and filenames. */
  title?: string;
  description: string;
  base_url: string;
  seed_data?: string;
  auth?: AuthConfig;
  /**
   * Optional directory for screenshots saved by `action: screenshot`.
   * Resolved relative to the runner cwd (same rule as `video.dir`).
   */
  screenshots?: ScreenshotConfig;
  /**
   * Optional device scale factor (DPR). When > 1, Playwright renders more pixels per CSS pixel,
   * producing "retina" screenshots (and higher-res recordings when video is enabled).
   * Default 1.
   */
  device_scale_factor?: number;
  /** Video recording: enable and set output folder (and optional filename). */
  video?: VideoConfig;
  /** Audio to mix into the final video. Requires ffmpeg and a .mp4 filename. */
  audio?: AudioConfig;
  /** Optional delay in ms after each step (for slower playback, e.g. demo videos). */
  step_delay_ms?: number;
  /** Playwright slowMo in ms: delay after each browser action (click, type, etc.) for smoother playback. */
  slow_mo_ms?: number;
  /** Delay in ms between keystrokes for type steps (human-like typing). Used with pressSequentially. */
  typing_delay_ms?: number;
  /** Delay in ms after each click (lets the result of the click be visible before next action). */
  post_click_delay_ms?: number;
  /** Wait in ms after each navigate (SPA hydration + hold on new page). Default 1500. */
  navigate_hold_ms?: number;
  /** Delay in ms before each navigate and before each click so the video has more frames of the current page before the cut (Playwright has no easing; at ~25 FPS the cut is instant). */
  pre_action_delay_ms?: number;
  /** Default Playwright action timeout in ms for click/navigate/type/fill/expect_visible steps.
   *  Per-step timeout_ms takes precedence. Default: 10000. */
  action_timeout_ms?: number;
  /** Path to a Playwright storageState JSON file to load before running (restores cookies/localStorage). Resolved relative to cwd. */
  storage_state?: string;
  /** Path to save the Playwright storageState JSON after the run completes (use with a login-only scenario to persist the session). Resolved relative to cwd. */
  save_storage_state?: string;
  /**
   * Optional URL → variable capture rules (entry scenario only).
   * On navigation, each rule's first regex group is written to `variables[variable]`.
   */
  url_capture?: UrlCaptureRule[];
  /** Flattened steps only (no import directives); after loadScenario. */
  steps: DemoStep[];
  /**
   * Optional arbitrary key/value map from YAML (e.g. YouTube paste text, tags). Ignored by parser
   * validation and by the Playwright runner; for humans or external tooling. Values may include
   * nested objects, arrays, and strings (e.g. `{{ VAR }}` placeholders).
   */
  metadata?: Record<string, unknown>;
}

/** Optional post-click readiness: wait for a visible UI signal after click. */
export type DemoStepSettleUntil = { text: string } | { locator: Locator };

export interface DemoStep {
  caption?: string;
  /** Overlay style for `caption:` — `chapter` uses a larger title-style bar. */
  caption_style?: CaptionStyle;
  action: ActionType;
  url?: string;
  locator?: Locator;
  value?: string;
  timeout_ms?: number;
  until?: "url" | "hidden";
  url_pattern?: string;
  /** Only for `action: wait` with `until: hidden`. Reload the page on this interval while waiting. */
  refresh_every_ms?: number;
  note?: string;
  /** Message to print to the console (supports {{ VAR }} interpolation). Used with action: log. */
  message?: string;
  /** Full-screen title text. Used with action: title_card. */
  text?: string;
  /** Hold duration in ms for title_card overlay, or black hold for transition (skips fade-back). Default 1800 for title_card. */
  hold_ms?: number;
  /** Fade duration in ms for title_card or transition. Default 400–500. */
  fade_ms?: number;
  /**
   * Only for `action: screenshot`.
   * - When the step has a `locator`, captures the element; otherwise captures the page.
   * - If `file` is omitted, runner auto-names `step-XX.png`.
   */
  screenshot?: ScreenshotOptions;
  /**
   * Only for `action: click`. After the click, wait until this UI signal is visible, then rAF paint.
   * Omit for rAF-only settle (Playwright click already auto-waits for actionability).
   */
  settle_until?: DemoStepSettleUntil;
  /**
   * Only for `action: type`. Ms between keystrokes; overrides scenario `typing_delay_ms`. Use 0 for long text.
   */
  typing_delay_ms?: number;
  /**
   * Only for `fill` / `type` when the target is a `<select>`. Waits until an option matching
   * `value` (visible label or `value` attribute) exists, selects, then polls until that choice is
   * actually selected — avoids long timeouts when options load async (Playwright does not fully
   * wait for dynamic options before select).
   */
  select_confirm?: boolean;
  /**
   * Only for `action: type`. When false, skip `locator.clear()` before `pressSequentially` — use after
   * inserting mentions/chips so the next keystrokes append instead of wiping the editor.
   * Default: clear first (backward compatible).
   */
  clear_before_type?: boolean;
  /**
   * Only for `repeat_while_visible` or `cut_video`. Nested steps run in order while `locator` matches a visible element,
   * or are excluded from the final video (`cut_video`).
   */
  steps?: DemoStep[];
  /** Safety cap for `repeat_while_visible`. Default 100. */
  max_iterations?: number;
  /**
   * Only for `cut_video`. Optional step (typically `title_card`) shown in the video immediately before the excluded block.
   */
  placeholder?: DemoStep;
  /**
   * When true on any step, that step's wall-clock duration is removed from the final video via ffmpeg splice.
   * Prefer `cut_video` with nested steps for multi-step excludes.
   */
  video_exclude?: boolean;
  /**
   * Only for `action: drag`. Horizontal pixel offset from the locator center (negative = left).
   */
  offset_x?: number;
  /**
   * Only for `action: drag`. Vertical pixel offset from the locator center. Default 0.
   */
  offset_y?: number;
}

/** Wall-clock exclude interval collected during a run (absolute `Date.now()` values). */
export interface VideoExcludeRange {
  startMs: number;
  endMs: number;
}

export interface ScreenshotConfig {
  /** Output folder path for screenshots (resolved relative to cwd when running). */
  dir: string;
}

export interface ScreenshotOptions {
  /** Output filename (e.g. "workflow-builder.png"). Defaults to `step-XX.png`. */
  file?: string;
  /** Capture full scrollable page (page screenshot only). Default false. */
  full_page?: boolean;
  /** For PNG screenshots only: make background transparent. Default false. */
  omit_background?: boolean;
  /**
   * Screenshot scale. When `device_scale_factor` > 1, use "device" to keep the higher pixel density.
   * Default "css".
   */
  scale?: "css" | "device";
}

/** Step-level import directive; expanded in place by the loader. */
export interface StepImport {
  import: string;
}

export type StepOrImport = DemoStep | StepImport;

/** Parsed scenario before loader expansion: steps may contain import directives; loader flattens to DemoScenario. */
export interface ParsedScenario extends Omit<DemoScenario, "steps"> {
  /** Top-level imports (paths relative to this file's directory); used only by loader. */
  imports?: string[];
  steps: StepOrImport[];
}

export interface RunContext {
  auth: { email: string; password: string };
  variables?: Record<string, string>;
}

export interface StepResult {
  stepIndex: number;
  action: ActionType;
  caption?: string;
  message?: string;
  startTimeMs: number;
  endTimeMs: number;
  success: boolean;
  error?: string;
  /** When true, this step's duration was cut from the final video. */
  excluded?: boolean;
}

export interface TimingStepEntry {
  /** 1-based step index in the scenario. */
  index: number;
  action: ActionType;
  caption?: string;
  message?: string;
  startSec: number;
  endSec: number;
  /** When true, step was removed from the final video (omit from YouTube chapters). */
  excluded?: boolean;
}

/** Exported next to the video for YouTube chapters and post-processing. */
export interface TimingExport {
  scenarioName: string;
  videoPath?: string;
  durationSec: number;
  steps: TimingStepEntry[];
}

export interface RunResult {
  success: boolean;
  error?: string;
  stepResults: StepResult[];
  /** Path to the saved video file, if video recording was enabled and completed. */
  videoPath?: string;
  /** Path to timing.json when video recording was enabled. */
  timingPath?: string;
}

export interface IDemoLogger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export interface IScenarioParser {
  parse(yaml: string): DemoScenario;
}

export interface IDemoRunner {
  run(scenario: DemoScenario, context: RunContext): Promise<RunResult>;
}
