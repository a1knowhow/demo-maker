/**
 * Run a demo scenario via Playwright. Resolves variables, captures IDs from URLs, records step results.
 */

import { copyFileSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { spawnSync } from "child_process";
import { chromium } from "playwright";
import type { Locator as PlaywrightLocator, Page } from "playwright";
import type {
  CaptionStyle,
  DemoScenario,
  DemoStep,
  DemoStepSettleUntil,
  IDemoLogger,
  Locator,
  RunContext,
  RunResult,
  StepResult,
  TimingExport,
  VideoConfig,
  VideoExcludeRange,
} from "./types";
import { resolveVariables } from "./variables";
import { resolveTemplateFunctions } from "./templates";
import { createDemoLogger, formatStepFailedLogLine, formatStepProgressLogLine } from "./logger";
import { remapTimelineSec, spliceVideoExcludingRanges, type TimeRangeSec } from "./ffmpeg";
import { applyUrlCapture, type UrlCaptureHook } from "./url-capture";

/**
 * Build RegExp for wait steps. Supports:
 * - Plain substring / regex body: `edit-doc`, `sb/workspace/[^/]+/edit-doc/`
 * - Slash-wrapped body (common in YAML): `/edit-doc/` → source `edit-doc`; `/\/edit-doc\//` → source `\/edit-doc\/` → matches one `/edit-doc/` path segment
 * - With flags: `/foo/i` → `foo` + flag `i`
 */
function scenarioUrlPatternToRegExp(raw: string): RegExp {
  const p = raw.trim();
  if (!p.startsWith("/") || p.length < 2) {
    return new RegExp(p);
  }
  const lastSlash = p.lastIndexOf("/");
  if (lastSlash <= 0) {
    return new RegExp(p);
  }
  const potentialFlags = p.slice(lastSlash + 1);
  if (potentialFlags !== "" && !/^[gimsuy]+$/.test(potentialFlags)) {
    return new RegExp(p);
  }
  const inner = p.slice(1, lastSlash);
  if (inner.length === 0) {
    return new RegExp(p);
  }
  const flags = potentialFlags === "" ? undefined : potentialFlags;
  return new RegExp(inner, flags);
}

function waitForApproval(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

function captureFromUrl(
  url: string,
  captured: Record<string, string>,
  hooks: UrlCaptureHook[] | undefined
): void {
  applyUrlCapture(url, captured, hooks);
}

/** Two animation frames so the page is painted after DOM updates. */
async function waitForRafPaint(page: Page): Promise<void> {
  try {
    await page.evaluate(
      () =>
        new Promise<void>((r) => {
          requestAnimationFrame(() => requestAnimationFrame(() => r()));
        })
    );
  } catch {
    // Context destroyed (e.g. navigation) — proceed so we don't fail the step
  }
}

/**
 * Max ms to wait for DOM readiness after navigation/reload.
 * Not networkidle — production SPAs keep WebSockets/analytics open and rarely go idle.
 */
const PAGE_DOM_SETTLE_TIMEOUT_MS = 5000;

/**
 * Wait for DOM ready and two animation frames so the page is painted.
 * Callers should then optionally wait a bit longer so the video encoder has time to capture the frame (see VIDEO_CAPTURE_BUFFER_MS).
 */
async function waitForPageDomSettled(
  page: Page,
  timeoutMs: number = PAGE_DOM_SETTLE_TIMEOUT_MS
): Promise<void> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  } catch {
    // Timeout: proceed; pacing holds and settle_until cover remaining readiness
  }
  await waitForRafPaint(page);
}

function domSettleTimeoutMs(actionTimeoutMs: number): number {
  return Math.min(actionTimeoutMs, PAGE_DOM_SETTLE_TIMEOUT_MS);
}

const HIDDEN_WAIT_POLL_MS = 500;

async function waitUntilHidden(
  page: Page,
  locator: Locator,
  timeoutMs: number,
  refreshEveryMs?: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastRefresh = Date.now();
  const locLabel = locatorToLogLabel(locator);

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const count = await getPlaywrightLocator(page, locator).count();
    if (count === 0) {
      return;
    }

    if (refreshEveryMs != null && refreshEveryMs > 0 && Date.now() - lastRefresh >= refreshEveryMs) {
      await page.reload({ waitUntil: "commit" });
      await waitForPageDomSettled(page, domSettleTimeoutMs(remaining));
      lastRefresh = Date.now();
      continue;
    }

    await new Promise((r) => setTimeout(r, Math.min(HIDDEN_WAIT_POLL_MS, remaining)));
  }

  throw new Error(`wait until hidden timed out after ${timeoutMs}ms (${locLabel})`);
}

async function isLocatorVisible(page: Page, locator: Locator): Promise<boolean> {
  const loc = getPlaywrightLocator(page, locator);
  const count = await loc.count();
  if (count === 0) {
    return false;
  }
  return loc.first().isVisible();
}

function settleUntilReadyPromise(
  page: Page,
  settleUntil: DemoStepSettleUntil,
  mergedContext: RunContext,
  timeoutMs: number
): Promise<void> {
  if ("text" in settleUntil) {
    const t = resolveVariables(settleUntil.text, mergedContext);
    return page.getByText(t, { exact: true }).waitFor({ state: "visible", timeout: timeoutMs });
  }
  const resolved = resolveLocatorVariables(settleUntil.locator, mergedContext);
  const loc = getPlaywrightLocator(page, resolved);
  return loc.waitFor({ state: "visible", timeout: timeoutMs });
}

/**
 * After a click: optionally wait for a visible readiness signal, then rAF paint.
 * Playwright click already auto-waits for actionability; no networkidle (discouraged on SPAs).
 */
async function waitAfterClickSettled(
  page: Page,
  timeoutMs: number,
  settleUntil: DemoStep["settle_until"],
  mergedContext: RunContext
): Promise<void> {
  if (settleUntil) {
    await settleUntilReadyPromise(page, settleUntil, mergedContext, timeoutMs);
  }
  await waitForRafPaint(page);
}

/** When recording video, wait this long after paint so the encoder captures the settled frame (runner shows it but video can lag). */
const VIDEO_CAPTURE_BUFFER_MS = 400;

const CAPTION_FADE_MS = 400;
const CAPTION_HOLD_MS = 2500;
const TITLE_CARD_HOLD_MS = 1800;
const TRANSITION_FADE_MS = 500;

function captionStyleCss(style: CaptionStyle): string {
  if (style === "chapter") {
    return [
      "position:fixed", "bottom:0", "left:0", "right:0",
      "transform:none",
      "z-index:2147483647", "pointer-events:none",
      "background:rgba(15,23,42,0.65)", "color:#f8fafc",
      "font:700 28px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "padding:20px 48px 28px",
      "max-width:none", "width:100%", "text-align:center",
      "border-radius:0",
      "letter-spacing:-0.02em",
      "box-shadow:0 -4px 24px rgba(0,0,0,0.25)",
    ].join(";");
  }
  return [
    "position:fixed", "bottom:48px", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483647", "pointer-events:none",
    "background:rgba(0,0,0,0.55)", "color:#fff",
    "font:600 22px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "padding:12px 32px", "border-radius:12px",
    "max-width:min(88%,960px)", "text-align:center",
    "box-shadow:0 8px 32px rgba(0,0,0,0.35)",
  ].join(";");
}

async function injectCaptionOverlay(page: Page, style: CaptionStyle = "default"): Promise<void> {
  await page.evaluate(
    ({ fadeMs, css }) => {
      let el = document.getElementById("__demo_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__demo_caption";
        document.body.appendChild(el);
      }
      el.style.cssText = [
        css,
        "opacity:0",
        `transition:opacity ${fadeMs}ms ease`,
        "white-space:pre-wrap",
      ].join(";");
    },
    { fadeMs: CAPTION_FADE_MS, css: captionStyleCss(style) }
  );
}

interface ShowCaptionOptions {
  /** When true, schedule fade-out after holdMs in the page; do not block the runner for the hold. */
  parallelHold?: boolean;
  holdMs?: number;
  fadeMs?: number;
  style?: CaptionStyle;
}

async function showCaption(page: Page, text: string, options?: ShowCaptionOptions): Promise<void> {
  const fadeMs = options?.fadeMs ?? CAPTION_FADE_MS;
  const holdMs = options?.holdMs ?? CAPTION_HOLD_MS;
  const parallelHold = options?.parallelHold === true;
  const style = options?.style ?? "default";
  try {
    await injectCaptionOverlay(page, style);
    await page.evaluate(
      ({ t, h, parallel }) => {
        const el = document.getElementById("__demo_caption");
        if (!el) return;
        const w = window as unknown as {
          __demoCaptionHideTimeout?: ReturnType<typeof setTimeout>;
        };
        if (w.__demoCaptionHideTimeout != null) {
          clearTimeout(w.__demoCaptionHideTimeout);
          w.__demoCaptionHideTimeout = undefined;
        }
        el.textContent = t;
        el.style.opacity = "1";
        if (parallel) {
          w.__demoCaptionHideTimeout = setTimeout(() => {
            w.__demoCaptionHideTimeout = undefined;
            const e = document.getElementById("__demo_caption");
            if (!e || !e.isConnected) return;
            if (e.style.opacity === "0") return;
            e.style.opacity = "0";
          }, h);
        }
      },
      { t: text, h: holdMs, parallel: parallelHold }
    );
    await new Promise((r) => setTimeout(r, fadeMs));
  } catch {
    /* navigation may destroy context */
  }
}

async function showTitleCard(
  page: Page,
  text: string,
  holdMs: number,
  fadeMs: number
): Promise<void> {
  try {
    await hideCaption(page);
    await page.evaluate(
      ({ t, fade }) => {
        const id = "__demo_title_card";
        document.getElementById(id)?.remove();
        const el = document.createElement("div");
        el.id = id;
        el.style.cssText = [
          "position:fixed", "inset:0", "z-index:2147483646", "pointer-events:none",
          "display:flex", "align-items:center", "justify-content:center",
          "background:rgba(15,23,42,0.55)", "color:#f8fafc",
          "backdrop-filter:blur(8px)", "-webkit-backdrop-filter:blur(8px)",
          "font:700 42px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
          "padding:48px", "text-align:center",
          "opacity:0", `transition:opacity ${fade}ms ease`,
        ].join(";");
        const inner = document.createElement("div");
        inner.id = "__demo_title_card_text";
        inner.style.cssText = "max-width:min(80%,900px);";
        inner.textContent = t;
        el.appendChild(inner);
        document.body.appendChild(el);
        el.style.opacity = "1";
      },
      { t: text, fade: fadeMs }
    );
    await new Promise((r) => setTimeout(r, fadeMs));
    await new Promise((r) => setTimeout(r, holdMs));
    await page.evaluate((fade) => {
      const el = document.getElementById("__demo_title_card");
      if (el) el.style.opacity = "0";
    }, fadeMs);
    await new Promise((r) => setTimeout(r, fadeMs));
    await page.evaluate(() => {
      document.getElementById("__demo_title_card")?.remove();
    });
  } catch {
    /* navigation may destroy context */
  }
}

async function showTransitionFade(page: Page, fadeMs: number, holdBlackMs?: number): Promise<void> {
  try {
    await hideCaption(page);
    await page.evaluate((fade) => {
      const id = "__demo_transition";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText = [
          "position:fixed", "inset:0", "z-index:2147483645", "pointer-events:none",
          "background:#000", "opacity:0", `transition:opacity ${fade}ms ease`,
        ].join(";");
        document.body.appendChild(el);
      }
      el.style.opacity = "1";
    }, fadeMs);
    await new Promise((r) => setTimeout(r, fadeMs));
    if (holdBlackMs != null && holdBlackMs > 0) {
      await new Promise((r) => setTimeout(r, holdBlackMs));
      return;
    }
    await new Promise((r) => setTimeout(r, Math.max(120, Math.floor(fadeMs / 2))));
    await page.evaluate((fade) => {
      const el = document.getElementById("__demo_transition");
      if (el) el.style.opacity = "0";
    }, fadeMs);
    await new Promise((r) => setTimeout(r, fadeMs));
  } catch {
    /* navigation may destroy context */
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function excludeRangesToSec(
  excludeRanges: VideoExcludeRange[],
  contextStartMs: number
): TimeRangeSec[] {
  return excludeRanges.map((r) => ({
    startSec: Math.max(0, (r.startMs - contextStartMs) / 1000),
    endSec: Math.max(0, (r.endMs - contextStartMs) / 1000),
  }));
}

function buildTimingExport(
  scenario: DemoScenario,
  stepResults: StepResult[],
  contextStartMs: number,
  videoPath?: string,
  excludeRanges: VideoExcludeRange[] = []
): TimingExport {
  const excludeSec = excludeRangesToSec(excludeRanges, contextStartMs);
  const nonExcluded = stepResults.filter((sr) => !sr.excluded);
  const last = nonExcluded[nonExcluded.length - 1] ?? stepResults[stepResults.length - 1];
  const rawDurationSec = last ? Math.max(0, (last.endTimeMs - contextStartMs) / 1000) : 0;
  let durationSec =
    excludeSec.length > 0 ? remapTimelineSec(rawDurationSec, excludeSec) : rawDurationSec;
  const playbackSpeed = scenario.video?.playback_speed ?? 1;
  if (playbackSpeed !== 1) {
    durationSec /= playbackSpeed;
  }

  return {
    scenarioName: scenario.name,
    videoPath,
    durationSec: Math.round(durationSec * 10) / 10,
    steps: stepResults.map((sr, idx) => {
      const rawStart = Math.max(0, (sr.startTimeMs - contextStartMs) / 1000);
      const rawEnd = Math.max(0, (sr.endTimeMs - contextStartMs) / 1000);
      let startSec = excludeSec.length > 0 ? remapTimelineSec(rawStart, excludeSec) : rawStart;
      let endSec = excludeSec.length > 0 ? remapTimelineSec(rawEnd, excludeSec) : rawEnd;
      if (playbackSpeed !== 1) {
        startSec /= playbackSpeed;
        endSec /= playbackSpeed;
      }
      const entry: TimingExport["steps"][number] = {
        index: idx + 1,
        action: sr.action,
        startSec: Math.round(startSec * 10) / 10,
        endSec: Math.round(endSec * 10) / 10,
      };
      if (sr.caption !== undefined) {
        entry.caption = sr.caption;
      }
      if (sr.message !== undefined) {
        entry.message = sr.message;
      }
      if (sr.excluded) {
        entry.excluded = true;
      }
      return entry;
    }),
  };
}

function writeTimingJson(timing: TimingExport, videoPath: string): string {
  const timingPath = videoPath.replace(/\.[^.]+$/, ".timing.json");
  writeFileSync(timingPath, `${JSON.stringify(timing, null, 2)}\n`, "utf8");
  return timingPath;
}

async function hideCaption(page: Page): Promise<void> {
  try {
    await page.evaluate((fadeMs) => {
      const w = window as unknown as {
        __demoCaptionHideTimeout?: ReturnType<typeof setTimeout>;
      };
      if (w.__demoCaptionHideTimeout != null) {
        clearTimeout(w.__demoCaptionHideTimeout);
        w.__demoCaptionHideTimeout = undefined;
      }
      const el = document.getElementById("__demo_caption");
      if (!el || el.style.opacity === "0") return;
      el.style.opacity = "0";
    }, CAPTION_FADE_MS);
    await new Promise((r) => setTimeout(r, CAPTION_FADE_MS));
  } catch {
    /* navigation may destroy context */
  }
}

/** Default pacing when scenario does not set delay fields (so runs without --fast are paced for video). */
const DEFAULT_PACING = {
  step_delay_ms: 500,
  slow_mo_ms: 100,
  typing_delay_ms: 50,
  post_click_delay_ms: 250,
  navigate_hold_ms: 2000,
  pre_action_delay_ms: 300,
} as const;

function getPlaywrightLocator(page: Page, locator: Locator) {
  switch (locator.kind) {
    case "role": {
      const name = typeof locator.name === "string" ? locator.name : locator.name;
      const options =
        typeof locator.name === "string"
          ? { name, exact: true as const }
          : { name };
      return page.getByRole(locator.role as "button" | "textbox" | "link" | "heading" | "main" | "dialog" | "combobox", options);
    }
    case "label":
      return page.getByLabel(locator.label);
    case "text":
      return page.getByText(locator.text);
    case "placeholder":
      return page.getByPlaceholder(locator.placeholder);
    case "title":
      return page.getByTitle(locator.title);
    case "selector":
      return page.locator(locator.selector);
    default:
      throw new Error(`Unknown locator kind: ${(locator as Locator).kind}`);
  }
}

export function resolveLocatorVariables(locator: Locator, context: RunContext): Locator {
  switch (locator.kind) {
    case "role":
      return {
        kind: "role",
        role: locator.role,
        name:
          typeof locator.name === "string"
            ? resolveVariables(locator.name, context)
            : locator.name,
      };
    case "label":
      return {
        kind: "label",
        label:
          typeof locator.label === "string"
            ? resolveVariables(locator.label, context)
            : locator.label,
      };
    case "text":
      return {
        kind: "text",
        text: resolveVariables(locator.text, context),
      };
    case "placeholder":
      return {
        kind: "placeholder",
        placeholder: resolveVariables(locator.placeholder, context),
      };
    case "title":
      return {
        kind: "title",
        title: resolveVariables(locator.title, context),
      };
    case "selector":
      return {
        kind: "selector",
        selector: resolveVariables(locator.selector, context),
      };
    default:
      return locator;
  }
}

async function isSelectLocator(loc: PlaywrightLocator): Promise<boolean> {
  try {
    return await loc.evaluate((el) => el instanceof HTMLSelectElement);
  } catch {
    return false;
  }
}

async function isFileInputLocator(loc: PlaywrightLocator): Promise<boolean> {
  try {
    return await loc.evaluate((el) => el instanceof HTMLInputElement && el.type === "file");
  } catch {
    return false;
  }
}

async function selectOptionSmart(
  loc: PlaywrightLocator,
  value: string,
  timeout: number,
  logger: IDemoLogger
): Promise<void> {
  // Try label first for human names (e.g. workspace), but cap label attempt time: values like
  // "hybrid" are usually <option value="hybrid"> with a longer visible label — a full-timeout
  // label attempt would hang until timeout before falling back to value.
  const labelTimeout = Math.min(2500, Math.max(400, Math.floor(timeout * 0.35)));
  const valueTimeout = Math.max(400, timeout - labelTimeout);
  try {
    await loc.selectOption({ label: value }, { timeout: labelTimeout });
    return;
  } catch (e1) {
    try {
      await loc.selectOption({ value }, { timeout: valueTimeout });
      return;
    } catch (e2) {
      logger.warn("Dropdown select failed for both option label and value.", {
        value,
        byLabelError: e1 instanceof Error ? e1.message : String(e1),
        byValueError: e2 instanceof Error ? e2.message : String(e2),
      });
      throw e2;
    }
  }
}

const SELECT_CONFIRM_POLL_MS = 50;

/** Poll until <select> contains an option whose label or value matches `want` (dynamic dropdowns). */
async function waitForSelectHasOption(
  loc: PlaywrightLocator,
  wantRaw: string,
  timeoutMs: number
): Promise<void> {
  const want = wantRaw.trim();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const has = await loc
      .evaluate((el, w) => {
        const s = el as HTMLSelectElement;
        return [...s.options].some((o) => o.text.trim() === w || o.value === w);
      }, want)
      .catch(() => false);
    if (has) return;
    await new Promise((r) => setTimeout(r, SELECT_CONFIRM_POLL_MS));
  }
  throw new Error(`select_confirm: no option matching "${want}" within ${timeoutMs}ms`);
}

/** Poll until the selected option's label or value matches `want` (post-select verification). */
async function waitForSelectedOptionMatches(
  loc: PlaywrightLocator,
  wantRaw: string,
  timeoutMs: number
): Promise<void> {
  const want = wantRaw.trim();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await loc
      .evaluate((el, w) => {
        const s = el as HTMLSelectElement;
        const idx = s.selectedIndex;
        if (idx < 0) return false;
        const o = s.options[idx];
        if (!o) return false;
        const t = o.text.trim();
        const v = o.value;
        if (!t && !v) return false;
        return t === w || v === w;
      }, want)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, SELECT_CONFIRM_POLL_MS));
  }
  const detail = await loc
    .evaluate((el) => {
      const s = el as HTMLSelectElement;
      const o = s.options[s.selectedIndex];
      return o ? { text: o.text.trim(), value: o.value } : null;
    })
    .catch(() => null);
  throw new Error(
    `select_confirm: expected "${want}" selected, current: ${JSON.stringify(detail)} (${timeoutMs}ms)`
  );
}

/** Optional strict path for <select>: wait for option → select → verify (equal phase budgets). */
async function runSelectStep(
  loc: PlaywrightLocator,
  value: string,
  timeoutMs: number,
  logger: IDemoLogger,
  confirm: boolean
): Promise<void> {
  if (!confirm) {
    await selectOptionSmart(loc, value, timeoutMs, logger);
    return;
  }
  const phaseMs = Math.max(800, Math.floor(timeoutMs / 3));
  await waitForSelectHasOption(loc, value, phaseMs);
  await selectOptionSmart(loc, value, phaseMs, logger);
  await waitForSelectedOptionMatches(loc, value, phaseMs);
}

/** Drag from the center of `locator` by pixel offset (e.g. split-pane resize). */
async function dragFromLocator(
  page: Page,
  locator: Locator,
  offsetX: number,
  offsetY: number,
  timeoutMs: number
): Promise<void> {
  const loc = getPlaywrightLocator(page, locator);
  await loc.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await loc.waitFor({ state: "visible", timeout: timeoutMs });
  const box = await loc.boundingBox();
  if (!box) {
    throw new Error("drag: element has no bounding box");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const steps = Math.max(5, Math.min(24, Math.round(Math.max(Math.abs(offsetX), Math.abs(offsetY)) / 8)));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + offsetX, startY + offsetY, { steps });
  await page.mouse.up();
}

const LOG_LABEL_MAX = 50;

function locatorToLogLabel(locator: Locator): string {
  switch (locator.kind) {
    case "role": {
      const name = typeof locator.name === "string" ? locator.name : locator.name.source;
      return `${locator.role} ${JSON.stringify(name)}`;
    }
    case "label": {
      const l = typeof locator.label === "string" ? locator.label : locator.label.source;
      return `label ${JSON.stringify(l)}`;
    }
    case "text":
      return JSON.stringify(locator.text);
    case "placeholder":
      return `placeholder ${JSON.stringify(locator.placeholder)}`;
    case "title":
      return `title ${JSON.stringify(locator.title)}`;
    case "selector":
      return `selector ${JSON.stringify(locator.selector)}`;
    default:
      return "";
  }
}

/** Optional resolved step fields (after variable interpolation) for logging. */
interface ResolvedStepHint {
  url?: string;
  locator?: Locator;
  value?: string;
  caption?: string;
}

function stepLogLabel(step: DemoStep, resolved?: ResolvedStepHint): string {
  const captionText = resolved?.caption ?? step.caption;
  if (captionText !== undefined && captionText.trim() !== "") {
    const s = captionText.trim();
    return s.length <= LOG_LABEL_MAX ? s : s.slice(0, LOG_LABEL_MAX) + "…";
  }
  switch (step.action) {
    case "navigate": {
      const u = resolved?.url ?? step.url;
      return u != null ? (u.length <= LOG_LABEL_MAX ? u : u.slice(0, LOG_LABEL_MAX) + "…") : "";
    }
    case "click":
    case "expect_visible": {
      const loc = resolved?.locator ?? step.locator;
      return loc != null ? locatorToLogLabel(loc) : "";
    }
    case "type":
    case "fill": {
      const loc = resolved?.locator ?? step.locator;
      const val = resolved?.value ?? step.value;
      if (loc != null) {
        const locStr = locatorToLogLabel(loc);
        const valStr = val != null ? (val.length <= 20 ? val : val.slice(0, 20) + "…") : "";
        return valStr !== "" ? `${locStr} → ${valStr}` : locStr;
      }
      return "";
    }
    case "wait":
      if (step.until === "url" && step.url_pattern != null) {
        return step.url_pattern.length <= LOG_LABEL_MAX ? step.url_pattern : step.url_pattern.slice(0, LOG_LABEL_MAX) + "…";
      }
      if (step.until === "hidden" && step.locator != null) {
        let label = `hidden ${locatorToLogLabel(step.locator)}`;
        if (step.refresh_every_ms != null) {
          label += ` refresh ${step.refresh_every_ms}ms`;
        }
        return label;
      }
      return step.timeout_ms != null ? `${step.timeout_ms}ms` : "";
    case "pause":
      return step.caption?.trim() ?? "pause";
    case "log": {
      const msg = step.message ?? "";
      return msg.length <= LOG_LABEL_MAX ? msg : msg.slice(0, LOG_LABEL_MAX) + "…";
    }
    case "title_card": {
      const t = step.text ?? "";
      return t.length <= LOG_LABEL_MAX ? t : t.slice(0, LOG_LABEL_MAX) + "…";
    }
    case "transition":
      return step.fade_ms != null ? `fade ${step.fade_ms}ms` : "fade";
    case "repeat_while_visible": {
      const loc = step.locator;
      const n = step.steps?.length ?? 0;
      const label = loc != null ? locatorToLogLabel(loc) : "";
      return n > 0 ? `${label} ×${n} steps` : label;
    }
    case "cut_video": {
      const n = step.steps?.length ?? 0;
      const ph = step.placeholder?.text ?? "";
      const phShort = ph.length <= 24 ? ph : ph.slice(0, 24) + "…";
      return n > 0 ? `exclude ${n} steps${phShort ? ` · ${phShort}` : ""}` : "exclude";
    }
    case "drag": {
      const ox = step.offset_x ?? 0;
      const oy = step.offset_y ?? 0;
      const loc = step.locator;
      const label = loc != null ? locatorToLogLabel(loc) : "";
      return `${label} Δ${ox},${oy}`;
    }
    default:
      return "";
  }
}

export interface RunScenarioOptions {
  logger?: IDemoLogger;
  headless?: boolean;
  /** Working directory for resolving relative paths (e.g. video.dir). Default process.cwd(). */
  cwd?: string;
  /** Path to a Playwright storageState JSON file to load before running (restores cookies/localStorage). Resolved relative to cwd. Overrides scenario.storage_state. */
  storageStatePath?: string;
  /** Path to save the Playwright storageState JSON after the run completes. Resolved relative to cwd. Overrides scenario.save_storage_state. */
  saveStorageStatePath?: string;
  /** Stop on the first step failure instead of continuing on a broken page. */
  failFast?: boolean;
  /** Run only steps 1..N (1-based inclusive). */
  endStep?: number;
  /** After the last executed step, wait for Enter in the terminal (headed only). */
  pauseAtEnd?: boolean;
  /** On step failure, save a PNG screenshot under this directory. */
  debugDir?: string;
  /** Basename for debug screenshots (defaults to scenario name). */
  scenarioLabel?: string;
  /** Optional hooks to capture variables from page URLs during the run. */
  urlCaptureHooks?: UrlCaptureHook[];
}

export interface RunScenarioOnPageOptions {
  logger?: IDemoLogger;
  /** Working directory for resolving relative paths (e.g. file inputs). Default process.cwd(). */
  cwd?: string;
  /** When set, adds video capture buffer delays after navigate/click. Omit for faster replay (e.g. continue-from). */
  videoConfig?: VideoConfig;
  headless?: boolean;
  /** Stop on the first step failure instead of continuing on a broken page. */
  failFast?: boolean;
  /** Run only steps 1..N (1-based inclusive). */
  endStep?: number;
  /** On step failure, save a PNG screenshot under this directory. */
  debugDir?: string;
  /** Basename for debug screenshots (defaults to scenario name). */
  scenarioLabel?: string;
  /** When false, skip the initial "/" bootstrap when the first step is not navigate. */
  skipBootstrap?: boolean;
  /** Collected exclude intervals (absolute wall-clock ms) for ffmpeg splice. */
  excludeRanges?: VideoExcludeRange[];
  /** When true, step results are marked excluded (used by cut_video nested runs). */
  markStepsExcluded?: boolean;
  /** Optional hooks to capture variables from page URLs during the run. */
  urlCaptureHooks?: UrlCaptureHook[];
}

/** Return a copy of the scenario with steps truncated to 1..endStep (1-based inclusive). */
export function sliceScenarioByEndStep(scenario: DemoScenario, endStep?: number): DemoScenario {
  if (endStep === undefined || endStep <= 0) {
    return scenario;
  }
  const total = scenario.steps.length;
  const capped = Math.min(endStep, total);
  if (capped >= total) {
    return scenario;
  }
  return { ...scenario, steps: scenario.steps.slice(0, capped) };
}

export interface RunScenarioOnPageResult {
  success: boolean;
  stepResults: StepResult[];
  error?: string;
}

/**
 * Run a scenario's steps on an existing Playwright page. Does not open/close browser or handle video.
 * Used by runScenario and by the recorder when continuing from an existing YAML.
 */
export async function runScenarioOnExistingPage(
  page: Page,
  scenario: DemoScenario,
  mergedContext: RunContext,
  options: RunScenarioOnPageOptions = {}
): Promise<RunScenarioOnPageResult> {
  const logger = options.logger ?? createDemoLogger("info");
  const cwd = options.cwd ?? process.cwd();
  const videoConfig = options.videoConfig;
  const headless = options.headless ?? false;
  const failFast = options.failFast === true;
  const debugDirRaw = options.debugDir;
  const debugDir = debugDirRaw ? resolve(cwd, debugDirRaw) : undefined;
  const scenarioLabel = options.scenarioLabel ?? scenario.name.replace(/\s+/g, "-").toLowerCase();
  scenario = sliceScenarioByEndStep(scenario, options.endStep);
  const screenshotsDirRaw = scenario.screenshots?.dir;
  const screenshotsDir = screenshotsDirRaw ? resolve(cwd, screenshotsDirRaw) : undefined;

  if (!mergedContext.variables) {
    mergedContext.variables = {};
  }
  const variables = mergedContext.variables;
  const stepResults: StepResult[] = [];
  let success = true;
  let lastError: string | undefined;

  const firstStep = scenario.steps[0];
  const firstIsNavigate =
    firstStep?.action === "navigate" && firstStep?.url !== undefined && firstStep.url.trim() !== "";
  const navigateHoldMs = scenario.navigate_hold_ms ?? DEFAULT_PACING.navigate_hold_ms;
  const skipBootstrap = options.skipBootstrap === true;
  if (!skipBootstrap && !firstIsNavigate) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForRafPaint(page);
    if (videoConfig) {
      await new Promise((r) => setTimeout(r, VIDEO_CAPTURE_BUFFER_MS));
    }
    await new Promise((r) => setTimeout(r, navigateHoldMs));
  }

  const excludeRanges = options.excludeRanges;
  const markStepsExcluded = options.markStepsExcluded === true;

  for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]!;
      const startTimeMs = Date.now();
      let stepSuccess = true;
      let stepError: string | undefined;
      let resolvedCaption: string | undefined;
      let skipDefaultStepResult = false;
      const videoExcludeStep = step.video_exclude === true;

      try {
        const url = page.url();
        captureFromUrl(url, variables, options.urlCaptureHooks);
        mergedContext.variables = variables;

        const resolvedUrl = step.url ? resolveVariables(step.url, mergedContext) : undefined;
        const resolvedValue = step.value ? resolveVariables(step.value, mergedContext) : undefined;
        resolvedCaption =
          step.caption !== undefined ? resolveVariables(step.caption, mergedContext).trim() : undefined;
        if (step.caption !== undefined && resolvedCaption === "") {
          throw new Error(`Step ${i + 1}: caption resolved to empty (check {{ variables }})`);
        }
        const resolvedLocator = step.locator
          ? resolveLocatorVariables(step.locator, mergedContext)
          : undefined;
        const timeout = step.timeout_ms ?? scenario.action_timeout_ms ?? 10000;

        const stepHint = stepLogLabel(step, {
          url: resolvedUrl,
          locator: resolvedLocator,
          value: resolvedValue,
          caption: resolvedCaption,
        });
        logger.info(
          formatStepProgressLogLine({
            stepIndex: i + 1,
            stepTotal: scenario.steps.length,
            action: step.action,
            hint: stepHint || undefined,
          })
        );

        const preActionMs = scenario.pre_action_delay_ms ?? DEFAULT_PACING.pre_action_delay_ms;

        switch (step.action) {
          case "navigate": {
            if (!resolvedUrl) {
              throw new Error("navigate requires url");
            }
            if (preActionMs > 0) {
              await new Promise((r) => setTimeout(r, preActionMs));
            }
            await page.goto(resolvedUrl, { timeout, waitUntil: "domcontentloaded" });
            await waitForRafPaint(page);
            if (videoConfig) {
              await new Promise((r) => setTimeout(r, VIDEO_CAPTURE_BUFFER_MS));
            }
            await new Promise((r) => setTimeout(r, navigateHoldMs));
            captureFromUrl(page.url(), variables, options.urlCaptureHooks);
            break;
          }
          case "click": {
            if (!resolvedLocator) {
              throw new Error("click requires locator");
            }
            if (preActionMs > 0) {
              await new Promise((r) => setTimeout(r, preActionMs));
            }
            const loc = getPlaywrightLocator(page, resolvedLocator);
            await loc.click({ timeout });
            const settleTimeout = step.settle_until ? timeout : domSettleTimeoutMs(timeout);
            await waitAfterClickSettled(
              page,
              settleTimeout,
              step.settle_until,
              mergedContext
            );
            if (videoConfig) {
              await new Promise((r) => setTimeout(r, VIDEO_CAPTURE_BUFFER_MS));
            }
            const postClick = scenario.post_click_delay_ms ?? DEFAULT_PACING.post_click_delay_ms;
            if (postClick > 0) {
              await new Promise((r) => setTimeout(r, postClick));
            }
            break;
          }
          case "drag": {
            if (!resolvedLocator) {
              throw new Error("drag requires locator");
            }
            if (step.offset_x === undefined) {
              throw new Error("drag requires offset_x");
            }
            if (preActionMs > 0) {
              await new Promise((r) => setTimeout(r, preActionMs));
            }
            await dragFromLocator(
              page,
              resolvedLocator,
              step.offset_x,
              step.offset_y ?? 0,
              timeout
            );
            if (videoConfig) {
              await new Promise((r) => setTimeout(r, VIDEO_CAPTURE_BUFFER_MS));
            }
            const postClick = scenario.post_click_delay_ms ?? DEFAULT_PACING.post_click_delay_ms;
            if (postClick > 0) {
              await new Promise((r) => setTimeout(r, postClick));
            }
            break;
          }
          case "type": {
            if (!resolvedLocator) {
              throw new Error("type requires locator");
            }
            const loc = getPlaywrightLocator(page, resolvedLocator);
            const value = resolvedValue ?? "";
            if (await isFileInputLocator(loc)) {
              // File inputs require setInputFiles(path). Resolve to absolute path (works for relative or absolute value).
              await loc.waitFor({ state: "attached", timeout });
              const filePath = resolve(cwd, value.trim());
              await loc.setInputFiles(filePath, { timeout });
              break;
            }
            if (await isSelectLocator(loc)) {
              await runSelectStep(loc, value, timeout, logger, step.select_confirm === true);
              break;
            }
            if (step.clear_before_type !== false) {
              await loc.clear({ timeout });
            }
            const typingDelay =
              step.typing_delay_ms ?? scenario.typing_delay_ms ?? DEFAULT_PACING.typing_delay_ms;
            await loc.pressSequentially(value, { timeout, delay: typingDelay });
            break;
          }
          case "fill": {
            if (!resolvedLocator) {
              throw new Error("fill requires locator");
            }
            const loc = getPlaywrightLocator(page, resolvedLocator);
            const value = resolvedValue ?? "";
            if (await isFileInputLocator(loc)) {
              await loc.waitFor({ state: "attached", timeout });
              const filePath = resolve(cwd, value.trim());
              await loc.setInputFiles(filePath, { timeout });
              break;
            }
            if (await isSelectLocator(loc)) {
              await runSelectStep(loc, value, timeout, logger, step.select_confirm === true);
              break;
            }
            await loc.fill(value, { timeout });
            break;
          }
          case "wait": {
            if (step.until === "url" && step.url_pattern) {
              const urlPat = resolveVariables(step.url_pattern, mergedContext);
              // SPAs (e.g. SvelteKit goto): `commit` tracks history URL changes without waiting for full load.
              await page.waitForURL(scenarioUrlPatternToRegExp(urlPat), {
                timeout,
                waitUntil: "commit",
              });
            } else if (step.until === "hidden" && resolvedLocator) {
              await waitUntilHidden(page, resolvedLocator, timeout, step.refresh_every_ms);
            } else if (step.timeout_ms) {
              await new Promise((r) => setTimeout(r, step.timeout_ms));
            }
            captureFromUrl(page.url(), variables, options.urlCaptureHooks);
            break;
          }
          case "expect_visible": {
            if (!resolvedLocator) {
              throw new Error("expect_visible requires locator");
            }
            const loc = getPlaywrightLocator(page, resolvedLocator);
            await loc.waitFor({ state: "visible", timeout });
            break;
          }
          case "screenshot": {
            if (!screenshotsDir) {
              throw new Error('screenshot requires top-level "screenshots: { dir: ... }"');
            }
            ensureDir(screenshotsDir);

            // Let the UI settle so we capture the intended state.
            await waitForPageDomSettled(page, domSettleTimeoutMs(timeout));
            await new Promise((r) => setTimeout(r, videoConfig ? VIDEO_CAPTURE_BUFFER_MS : 0));

            const sc = step.screenshot ?? {};
            const fileRaw = sc.file?.trim();
            const autoName = `step-${String(i + 1).padStart(2, "0")}.png`;
            const fileResolved = resolveTemplateFunctions(
              resolveVariables(fileRaw && fileRaw !== "" ? fileRaw : autoName, mergedContext)
            );
            const outPath = join(screenshotsDir, fileResolved);

            const omitBackground = sc.omit_background === true;
            const scale = sc.scale === "device" ? "device" : "css";

            if (resolvedLocator) {
              const loc = getPlaywrightLocator(page, resolvedLocator);
              await loc.screenshot({
                path: outPath,
                omitBackground,
                scale,
                timeout,
              });
            } else {
              await page.screenshot({
                path: outPath,
                fullPage: sc.full_page === true,
                omitBackground,
                scale,
                timeout,
              });
            }
            logger.info(`[screenshot] ${outPath}`);
            break;
          }
          case "pause": {
            const message =
              step.caption?.trim() || "Press Enter to continue...";
            if (headless) {
              logger.info(`[pause skipped in headless] ${message}`);
            } else {
              logger.info(`[pause] ${message}`);
              await waitForApproval(`${message}\n`);
            }
            break;
          }
          case "log": {
            const raw = step.message ?? "";
            const resolved = resolveVariables(raw, mergedContext);
            logger.info(`[log] ${resolved}`);
            break;
          }
          case "title_card": {
            const text = resolveVariables(step.text ?? "", mergedContext).trim();
            if (!text) {
              throw new Error("title_card requires text");
            }
            const holdMs = step.hold_ms ?? TITLE_CARD_HOLD_MS;
            const fadeMs = step.fade_ms ?? CAPTION_FADE_MS;
            await showTitleCard(page, text, holdMs, fadeMs);
            break;
          }
          case "transition": {
            const fadeMs = step.fade_ms ?? TRANSITION_FADE_MS;
            await showTransitionFade(page, fadeMs, step.hold_ms);
            break;
          }
          case "repeat_while_visible": {
            if (!resolvedLocator || !step.steps?.length) {
              throw new Error("repeat_while_visible requires locator and steps");
            }
            const maxIterations = step.max_iterations ?? 100;
            const nestedScenario: DemoScenario = { ...scenario, steps: step.steps };
            let iteration = 0;
            while (iteration < maxIterations) {
              if (!(await isLocatorVisible(page, resolvedLocator))) {
                break;
              }
              iteration++;
              logger.info(`[repeat_while_visible] iteration ${iteration}`);
              const nested = await runScenarioOnExistingPage(page, nestedScenario, mergedContext, {
                ...options,
                skipBootstrap: true,
                endStep: undefined,
              });
              if (!nested.success) {
                throw new Error(nested.error ?? `repeat_while_visible nested steps failed on iteration ${iteration}`);
              }
            }
            if (iteration >= maxIterations && (await isLocatorVisible(page, resolvedLocator))) {
              throw new Error(`repeat_while_visible exceeded max_iterations (${maxIterations})`);
            }
            break;
          }
          case "cut_video": {
            if (!step.steps?.length) {
              throw new Error("cut_video requires steps");
            }
            if (step.placeholder) {
              const phScenario: DemoScenario = { ...scenario, steps: [step.placeholder] };
              const phResult = await runScenarioOnExistingPage(page, phScenario, mergedContext, {
                ...options,
                skipBootstrap: true,
                endStep: 1,
                markStepsExcluded: false,
              });
              stepResults.push(...phResult.stepResults);
              if (!phResult.success) {
                throw new Error(phResult.error ?? "cut_video placeholder step failed");
              }
            }
            const excludeStartMs = Date.now();
            const nestedScenario: DemoScenario = { ...scenario, steps: step.steps };
            const nested = await runScenarioOnExistingPage(page, nestedScenario, mergedContext, {
              ...options,
              skipBootstrap: true,
              endStep: undefined,
              markStepsExcluded: true,
            });
            const excludeEndMs = Date.now();
            if (excludeRanges && excludeEndMs > excludeStartMs) {
              excludeRanges.push({ startMs: excludeStartMs, endMs: excludeEndMs });
            }
            stepResults.push(
              ...nested.stepResults.map((sr) => ({
                ...sr,
                excluded: true,
              }))
            );
            if (!nested.success) {
              throw new Error(nested.error ?? "cut_video nested steps failed");
            }
            skipDefaultStepResult = true;
            break;
          }
          default:
            throw new Error(`Unhandled action: ${(step as DemoStep).action}`);

        }

        if (videoConfig && resolvedCaption) {
          const captionStyle = step.caption_style ?? "default";
          await injectCaptionOverlay(page, captionStyle);
          const parallel = videoConfig.caption_parallel === true;
          await showCaption(page, resolvedCaption, {
            parallelHold: parallel,
            holdMs: CAPTION_HOLD_MS,
            fadeMs: CAPTION_FADE_MS,
            style: captionStyle,
          });
          if (!parallel) {
            await new Promise((r) => setTimeout(r, CAPTION_HOLD_MS));
          }
        } else if (videoConfig && !videoConfig.caption_parallel) {
          await hideCaption(page);
        }
      } catch (err) {
        stepSuccess = false;
        success = false;
        stepError = err instanceof Error ? err.message : String(err);
        lastError = stepError;
        logger.error(formatStepFailedLogLine(i + 1, stepError));
        if (debugDir) {
          try {
            ensureDir(debugDir);
            const shotPath = join(debugDir, `${scenarioLabel}-step-${i + 1}.png`);
            await page.screenshot({ path: shotPath, fullPage: true });
            logger.info(`[debug] failure screenshot: ${shotPath}`);
          } catch (shotErr) {
            logger.warn(
              "Failed to save debug screenshot:",
              shotErr instanceof Error ? shotErr.message : shotErr
            );
          }
        }
      }

      const endTimeMs = Date.now();
      if (videoExcludeStep && excludeRanges && endTimeMs > startTimeMs) {
        excludeRanges.push({ startMs: startTimeMs, endMs: endTimeMs });
      }

      if (!skipDefaultStepResult) {
        const stepResult: StepResult = {
          stepIndex: i,
          action: step.action,
          startTimeMs,
          endTimeMs,
          success: stepSuccess,
        };
        if (resolvedCaption !== undefined) {
          stepResult.caption = resolvedCaption;
        }
        if (step.action === "log" && step.message) {
          stepResult.message = resolveVariables(step.message, mergedContext);
        }
        if (stepError !== undefined) {
          stepResult.error = stepError;
        }
        if (videoExcludeStep || markStepsExcluded) {
          stepResult.excluded = true;
        }
        stepResults.push(stepResult);
      }

      const delayMs = scenario.step_delay_ms ?? DEFAULT_PACING.step_delay_ms;
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      if (!stepSuccess && failFast) {
        break;
      }
    }

  return { success, stepResults, error: lastError };
}

/**
 * Run a demo scenario: launch browser, execute steps, resolve variables, capture IDs from URLs.
 * Returns RunResult with step timestamps and captions for post-processing.
 */
export async function runScenario(
  scenario: DemoScenario,
  context: RunContext,
  options: RunScenarioOptions = {}
): Promise<RunResult> {
  const logger = options.logger ?? createDemoLogger("info");
  const cwd = options.cwd ?? process.cwd();

  const loadStateRaw = options.storageStatePath ?? scenario.storage_state;
  const loadStatePath = loadStateRaw ? resolve(cwd, loadStateRaw) : undefined;
  const saveStateRaw = options.saveStorageStatePath ?? scenario.save_storage_state;
  const saveStatePath = saveStateRaw ? resolve(cwd, saveStateRaw) : undefined;

  const variables = { ...context.variables } as Record<string, string>;
  const mergedContext: RunContext = {
    ...context,
    variables,
  };

  let success = false;
  let stepResults: StepResult[] = [];
  let lastError: string | undefined;
  let contextStartMs = 0;
  const excludeRanges: VideoExcludeRange[] = [];
  const videoConfig = scenario.video?.enabled ? scenario.video : undefined;
  const headless = options.headless ?? false;
  const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };
  // video.viewport = browser render size (must fit the physical screen for headed mode).
  // video.size    = final output video resolution (ffmpeg upscales if different from viewport).
  // When viewport is omitted, falls back to size, then DEFAULT_VIEWPORT.
  const viewport = videoConfig?.viewport ?? videoConfig?.size ?? DEFAULT_VIEWPORT;
  const videoOutputSize = videoConfig?.size ?? DEFAULT_VIEWPORT;
  let recordVideoDir: string | undefined;
  let videoOutputDir: string | undefined;
  let videoFilename: string | undefined;
  let videoPath: string | undefined;

  if (videoConfig) {
    videoOutputDir = resolve(cwd, videoConfig.dir);
    ensureDir(videoOutputDir);
    if (videoConfig.filename) {
      recordVideoDir = join(tmpdir(), `demo-maker-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      ensureDir(recordVideoDir);
      videoFilename = resolveTemplateFunctions(videoConfig.filename);
    } else {
      recordVideoDir = videoOutputDir;
    }
  }
  const screenshotsDirRaw = scenario.screenshots?.dir;
  if (screenshotsDirRaw) {
    ensureDir(resolve(cwd, screenshotsDirRaw));
  }

  const slowMo = scenario.slow_mo_ms ?? DEFAULT_PACING.slow_mo_ms;
  // --start-maximized requires viewport: null to work on macOS; only use when not recording video
  // (video recording requires a fixed viewport size).
  const maximize = !headless && !recordVideoDir;
  const browser = await chromium.launch({
    headless,
    slowMo,
    args: maximize ? ["--start-maximized"] : [],
  });
  try {
    const contextOptions: Parameters<typeof browser.newContext>[0] = {
      baseURL: scenario.base_url,
      viewport: maximize ? null : viewport,
    };
    if (scenario.device_scale_factor && scenario.device_scale_factor > 0) {
      contextOptions.deviceScaleFactor = scenario.device_scale_factor;
    }
    if (recordVideoDir) {
      contextOptions.recordVideo = {
        dir: recordVideoDir,
        size: viewport,
      };
    }
    if (loadStatePath) {
      contextOptions.storageState = loadStatePath;
      logger.info(`Loading session state from: ${loadStatePath}`);
    }

    const browserContext = await browser.newContext(contextOptions);
    contextStartMs = Date.now();
    const page = await browserContext.newPage();

    const runResult = await runScenarioOnExistingPage(page, scenario, mergedContext, {
      logger,
      cwd,
      videoConfig,
      headless,
      failFast: options.failFast,
      endStep: options.endStep,
      debugDir: options.debugDir,
      scenarioLabel: options.scenarioLabel,
      excludeRanges,
      urlCaptureHooks: options.urlCaptureHooks,
    });
    success = runResult.success;
    stepResults = runResult.stepResults;
    lastError = runResult.error;

    if (options.pauseAtEnd && !headless) {
      await waitForApproval("Paused at end of run. Press Enter to close the browser...\n");
    }

    if (saveStatePath) {
      await browserContext.storageState({ path: saveStatePath });
      logger.info(`Session state saved to: ${saveStatePath}`);
    }

    await browserContext.close();

    if (recordVideoDir) {
      const video = page.video();
      if (video) {
        try {
          const recordedPath = await video.path();
          if (recordedPath) {
            if (videoFilename && videoOutputDir) {
              const destPath = join(videoOutputDir, videoFilename);
              copyFileSync(recordedPath, destPath);
              videoPath = destPath;
            } else {
              videoPath = recordedPath;
            }
          }
        } catch (e) {
          logger.warn("Failed to get or save video path:", e instanceof Error ? e.message : e);
        }
      }
    }

    const excludeSec = excludeRangesToSec(excludeRanges, contextStartMs);

    if (videoPath && excludeSec.length > 0) {
      const last = stepResults[stepResults.length - 1];
      const durationSec = last ? Math.max(0, (last.endTimeMs - contextStartMs) / 1000) : 0;
      const splicedPath = join(tmpdir(), `demo-splice-${Date.now()}.webm`);
      const spliceResult = spliceVideoExcludingRanges(videoPath, splicedPath, durationSec, excludeSec);
      if (spliceResult.ok && (spliceResult.removedSec ?? 0) > 0) {
        copyFileSync(splicedPath, videoPath);
        unlinkSync(splicedPath);
        logger.info(
          `Spliced video: removed ${(spliceResult.removedSec ?? 0).toFixed(1)}s of excluded content.`
        );
      } else if (!spliceResult.ok) {
        logger.warn(
          "ffmpeg splice failed (is ffmpeg installed?):",
          spliceResult.stderr?.slice(-500) ?? "unknown error"
        );
      } else if (spliceResult.ok) {
        try {
          unlinkSync(splicedPath);
        } catch {
          /* temp file may not exist */
        }
      }
    }

    if (videoPath && videoConfig?.start_step != null && videoConfig?.end_step != null) {
      const startStep = videoConfig.start_step;
      const endStep = videoConfig.end_step;
      const n = scenario.steps.length;
      if (startStep >= 1 && endStep >= startStep && endStep <= n) {
        const startIdx = startStep - 1;
        const endIdx = endStep - 1;
        const rawStartSec = Math.max(0, (stepResults[startIdx]!.startTimeMs - contextStartMs) / 1000);
        const rawEndSec = (stepResults[endIdx]!.endTimeMs - contextStartMs) / 1000;
        const startSec = excludeSec.length > 0 ? remapTimelineSec(rawStartSec, excludeSec) : rawStartSec;
        const endSec = excludeSec.length > 0 ? remapTimelineSec(rawEndSec, excludeSec) : rawEndSec;
        if (endSec > startSec) {
          const trimmedPath = join(tmpdir(), `demo-trim-${Date.now()}-${resolveTemplateFunctions(videoConfig.filename ?? "out.webm")}`);
          const ff = spawnSync("ffmpeg", [
            "-y",
            "-i", videoPath,
            "-ss", String(startSec),
            "-to", String(endSec),
            "-c", "copy",
            trimmedPath,
          ], { encoding: "utf8" });
          if (ff.status === 0) {
            copyFileSync(trimmedPath, videoPath);
            unlinkSync(trimmedPath);
            logger.info(`Trimmed video to steps ${startStep}-${endStep} (${startSec.toFixed(1)}s–${endSec.toFixed(1)}s).`);
          } else {
            logger.warn("ffmpeg trim failed (is ffmpeg installed?):", ff.stderr?.slice(-500) ?? ff.error);
          }
        }
      }
    }

    // Re-encode to H.264 MP4 when the output filename ends in .mp4.
    // Playwright always writes VP8 WebM at a hardcoded 1 Mbit/s, which degrades badly on
    // YouTube. Re-encoding with libx264 CRF 18 produces near-lossless quality and the
    // yuv420p/faststart flags ensure compatibility with all players and YouTube's ingestion.
    // When video.viewport is smaller than video.size (e.g. MacBook headed mode), ffmpeg also
    // upscales to the target resolution using the high-quality lanczos scaler.
    // When audio.background is set, the music track is mixed in (looped to video length, trimmed with -shortest).
    if (videoPath && videoPath.endsWith(".mp4")) {
      const playbackSpeed = scenario.video?.playback_speed ?? 1;
      const needsUpscale =
        viewport.width !== videoOutputSize.width || viewport.height !== videoOutputSize.height;
      const vfFilters: string[] = [];
      if (playbackSpeed !== 1) {
        vfFilters.push(`setpts=PTS/${playbackSpeed}`);
      }
      if (needsUpscale) {
        vfFilters.push(`scale=${videoOutputSize.width}:${videoOutputSize.height}:flags=lanczos`);
      }
      const videoFilter = vfFilters.length > 0 ? ["-vf", vfFilters.join(",")] : [];

      const audioPath = scenario.audio?.background
        ? resolve(cwd, scenario.audio.background)
        : undefined;
      const audioInput = audioPath
        ? ["-stream_loop", "-1", "-i", audioPath]
        : [];
      const audioCodec = audioPath
        ? ["-c:a", "aac", "-b:a", "192k", "-shortest"]
        : [];

      const encodedPath = join(tmpdir(), `demo-encoded-${Date.now()}.mp4`);
      const ff = spawnSync("ffmpeg", [
        "-y",
        "-i", videoPath,
        ...audioInput,
        ...videoFilter,
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "slow",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        ...audioCodec,
        encodedPath,
      ], { encoding: "utf8" });
      if (ff.status === 0) {
        copyFileSync(encodedPath, videoPath);
        unlinkSync(encodedPath);
        const parts: string[] = [];
        if (playbackSpeed !== 1) parts.push(`Playback speed ${playbackSpeed}×`);
        if (needsUpscale) parts.push(`Upscaled ${viewport.width}x${viewport.height} → ${videoOutputSize.width}x${videoOutputSize.height}`);
        if (audioPath) parts.push("Mixed background audio");
        logger.info(`Re-encoded to H.264 MP4 (CRF 18).${parts.length ? " " + parts.join(". ") + "." : ""}`);
      } else {
        logger.warn("ffmpeg H.264 re-encode failed — keeping original file. Is ffmpeg installed?", ff.stderr?.slice(-500) ?? ff.error);
      }
    }
  } finally {
    await browser.close();
  }

  const result: RunResult = { success, stepResults };
  if (lastError !== undefined) {
    result.error = lastError;
  }
  if (videoPath !== undefined) {
    result.videoPath = videoPath;
    const timing = buildTimingExport(scenario, stepResults, contextStartMs, videoPath, excludeRanges);
    try {
      result.timingPath = writeTimingJson(timing, videoPath);
      logger.info(`Timing saved: ${result.timingPath}`);
    } catch (e) {
      logger.warn("Failed to write timing.json:", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
