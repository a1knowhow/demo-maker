/**
 * Format parse/validation errors with file and step context for composed scenarios.
 */

const SUMMARY_MAX = 120;

export interface ParseScenarioContext {
  /** Absolute or relative path to the YAML file being parsed. */
  sourceFile?: string;
  /** Scenario `name:` from the same file. */
  scenarioName?: string;
}

function truncate(value: string, max = SUMMARY_MAX): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) {
    return oneLine;
  }
  return `${oneLine.slice(0, max - 1)}…`;
}

/** One-line summary of raw YAML step fields for error messages. */
export function summarizeRawStep(raw: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof raw.action === "string") {
    parts.push(`action=${raw.action}`);
  }
  if (typeof raw.import === "string") {
    parts.push(`import=${raw.import}`);
  }
  if (typeof raw.url === "string") {
    parts.push(`url=${truncate(raw.url)}`);
  }
  if (typeof raw.value === "string") {
    parts.push(`value=${truncate(raw.value)}`);
  }
  if (typeof raw.message === "string") {
    parts.push(`message=${truncate(raw.message)}`);
  }
  if (typeof raw.caption === "string") {
    parts.push(`caption=${truncate(raw.caption)}`);
  }
  if (typeof raw.text === "string") {
    parts.push(`text=${truncate(raw.text)}`);
  }
  if (raw.locator !== undefined) {
    try {
      parts.push(`locator=${truncate(JSON.stringify(raw.locator))}`);
    } catch {
      parts.push("locator=<unserializable>");
    }
  }
  return parts.join(", ");
}

const VALID_LOCATOR_KEYS = new Set(["role", "label", "aria-label", "text", "placeholder", "title", "selector"]);

/** Hint when `locator:` is present but did not map to a supported shape. */
export function describeInvalidLocator(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object") {
    return `locator must be an object, got ${typeof raw}`;
  }
  const keys = Object.keys(raw as Record<string, unknown>);
  if (keys.length === 0) {
    return 'locator object is empty (use role, label, aria-label, text, placeholder, title, or selector)';
  }
  const unknown = keys.filter((k) => !VALID_LOCATOR_KEYS.has(k));
  if (unknown.length > 0) {
    return `unrecognized locator key(s): ${unknown.join(", ")} (use role, label, aria-label, text, placeholder, title, or selector)`;
  }
  return undefined;
}

export function formatStepParseError(
  ctx: ParseScenarioContext,
  stepIndex: number,
  message: string,
  rawStep?: Record<string, unknown>
): string {
  const stepNum = stepIndex + 1;
  const where: string[] = [`Step ${stepNum}`];
  if (ctx.sourceFile) {
    where.push(`in ${ctx.sourceFile}`);
  }
  if (ctx.scenarioName) {
    where.push(`(scenario "${ctx.scenarioName}")`);
  }
  let out = `${where.join(" ")}: ${message}`;
  if (rawStep) {
    const summary = summarizeRawStep(rawStep);
    if (summary) {
      out += `\n  step: ${summary}`;
    }
  }
  return out;
}
