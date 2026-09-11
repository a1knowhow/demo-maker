/**
 * Node-safe logger for the demo-maker. No SvelteKit or $app imports.
 */

import type { IDemoLogger } from "./types";

/** Local time `HH:mm:ss` for step progress lines. */
export function formatLocalTimeHHMMSS(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ansiColorEnabled(): boolean {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") {
    return true;
  }
  return process.stdout.isTTY === true;
}

/** Widest `ActionType` string (`expect_visible`) — pad so hint column lines up. */
const STEP_ACTION_COLUMN_WIDTH = 14;

function paddedStepCounter(stepIndex: number, stepTotal: number): string {
  const w = Math.max(1, String(stepTotal).length);
  return `${String(stepIndex).padStart(w, " ")}/${stepTotal}`;
}

function paddedActionVerb(action: string): string {
  return action.padEnd(STEP_ACTION_COLUMN_WIDTH, " ");
}

const ANSI = {
  reset: "\x1b[0m",
  /** Timestamp */
  time: "\x1b[2;36m",
  /** Punctuation: ` - ` and `: ` between segments */
  sep: "\x1b[2;90m",
  /** `Step i/n` */
  step: "\x1b[1;97m",
  /** Action verb: click, fill, wait, … */
  action: "\x1b[33m",
  /** Locator / URL / caption tail after action */
  detail: "\x1b[35m",
  /** Errors */
  err: "\x1b[31m",
} as const;

export interface StepProgressLogParts {
  stepIndex: number;
  stepTotal: number;
  action: string;
  hint?: string;
}

/**
 * One-line step progress for the terminal: `22:45:59 - Step 8/37: wait - 3500ms`.
 * Uses ANSI colors when stdout is a TTY and `NO_COLOR` is unset.
 */
export function formatStepProgressLogLine(parts: StepProgressLogParts): string {
  const ts = formatLocalTimeHHMMSS();
  const { stepIndex, stepTotal, action, hint } = parts;
  const hintTrim = hint?.trim();
  const hasHint = hintTrim !== undefined && hintTrim !== "";

  const stepPart = paddedStepCounter(stepIndex, stepTotal);
  const actionPart = paddedActionVerb(action);

  if (!ansiColorEnabled()) {
    const core = `Step ${stepPart}: ${actionPart}`;
    return `${ts} - ${core}${hasHint ? ` - ${hintTrim}` : ""}`;
  }

  const { reset, time, sep, step, action: actStyle, detail } = ANSI;
  let out = `${time}${ts}${reset}${sep} - ${reset}${step}Step ${stepPart}${reset}${sep}: ${reset}${actStyle}${actionPart}${reset}`;
  if (hasHint) {
    out += `${sep} - ${reset}${detail}${hintTrim}${reset}`;
  }
  return out;
}

export function formatStepFailedLogLine(stepIndex: number, message: string): string {
  const ts = formatLocalTimeHHMMSS();
  if (!ansiColorEnabled()) {
    return `${ts} - Step ${stepIndex} failed: ${message}`;
  }
  const { reset, time, sep, step, err } = ANSI;
  return `${time}${ts}${reset}${sep} - ${reset}${step}Step ${stepIndex} failed${reset}${sep}: ${reset}${err}${message}${reset}`;
}

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createDemoLogger(
  level: "debug" | "info" | "warn" | "error" = "info"
): IDemoLogger {
  const minLevel = LEVEL_ORDER[level] ?? LEVEL_ORDER.info ?? 0;

  function shouldLog(msgLevel: string): boolean {
    return (LEVEL_ORDER[msgLevel] ?? 0) >= minLevel;
  }

  return {
    log(...args: unknown[]) {
      console.log(...args);
    },
    info(...args: unknown[]) {
      if (shouldLog("info")) console.info(...args);
    },
    warn(...args: unknown[]) {
      if (shouldLog("warn")) console.warn(...args);
    },
    error(...args: unknown[]) {
      if (shouldLog("error")) console.error(...args);
    },
    debug(...args: unknown[]) {
      if (shouldLog("debug")) console.debug(...args);
    },
  };
}
