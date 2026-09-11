/**
 * Map Playwright recorder action selector strings and generated code to demo-maker Locator.
 * Prefer parsing the generated code string (e.g. getByRole('button', { name: 'Accept' }))
 * so we get the exact button/link/text filter.
 */

import type { Locator } from "./types";

const RECORDED_FALLBACK = "(recorded)";

const warnedKeys = new Set<string>();
function warnOnce(key: string, ...args: unknown[]): void {
  if (warnedKeys.has(key)) {
    return;
  }
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function truncate(s: string, max = 300): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return t.slice(0, Math.max(0, max - 3)) + "...";
}

function isRecordedFallbackLocator(locator: Locator): boolean {
  return (
    (locator.kind === "text" && locator.text === RECORDED_FALLBACK) ||
    (locator.kind === "role" && typeof locator.name === "string" && locator.name === RECORDED_FALLBACK)
  );
}

function parseNameFromOptionsObjectLiteral(options: string): string | RegExp | null {
  // Very small, pragmatic parser for the recorder output.
  // Examples:
  //   { name: 'Accept', exact: true }
  //   { exact: true, name: "Accept" }
  //   { name: /Sign in/i }
  const opts = options.trim();
  if (!opts) {
    return null;
  }

  const nameStringMatch = opts.match(/(?:^|[,{]\s*)name\s*:\s*["']([^"']*)["']\s*(?:,|$)/);
  if (nameStringMatch) {
    return nameStringMatch[1] ?? "";
  }

  const nameRegexMatch = opts.match(/(?:^|[,{]\s*)name\s*:\s*\/([^/]+)\/([i]*)\s*(?:,|$)/);
  if (nameRegexMatch) {
    const pattern = (nameRegexMatch[1] ?? "").trim();
    const flags = (nameRegexMatch[2] ?? "").trim();
    if (!pattern) {
      return null;
    }
    return new RegExp(pattern, flags);
  }

  return null;
}

/**
 * Extract aria-label or label= from Playwright internal selector strings.
 */
export function extractLabelFromSelector(selector: string | undefined): string | null {
  const s = (selector ?? "").trim();
  if (!s) {
    return null;
  }

  const tryMatch = (haystack: string): string | null => {
    const labelMatch =
      haystack.match(/label=(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/i) ??
      haystack.match(/internal:attr\s*=\s*\[\s*aria-label\s*=\s*(?:"([^"]*)"|'([^']*)')\s*]/i) ??
      haystack.match(/internal:attr\s*=\s*\[\s*aria-labelledby\s*=\s*(?:"([^"]*)"|'([^']*)')\s*]/i);
    if (!labelMatch) {
      return null;
    }
    const label = (labelMatch[1] ?? labelMatch[2] ?? labelMatch[3] ?? "").trim();
    return label || null;
  };

  const chunks = s.split(">>").map((c) => c.trim()).filter(Boolean);
  for (const c of chunks.length ? chunks : [s]) {
    const label = tryMatch(c);
    if (label) {
      return label;
    }
  }
  return tryMatch(s);
}

/**
 * Parse Playwright-generated code string to extract our Locator.
 * Code looks like: "await page.getByRole('button', { name: 'Accept' }).click();"
 * or getByLabel('Email'), getByText('Sign in'), getByPlaceholder('...'), getByTitle('...').
 * Returns null if no known locator pattern found.
 */
export function parseCodeToLocator(code: string | undefined): Locator | null {
  // Normalize: collapse newlines so we match when code is multi-line
  const s = (code ?? "").replace(/\s+/g, " ").trim();
  if (!s) {
    return null;
  }

  // getByLabel('Email') or getByLabel("Email") — before getByRole (more specific for form fields)
  const getByLabelMatch = s.match(/\.getByLabel\s*\(\s*["']([^"']*)["']\s*\)/);
  if (getByLabelMatch) {
    const label = getByLabelMatch[1]!.trim();
    if (label) {
      return { kind: "label", label };
    }
  }

  // getByRole('button', { name: 'Accept', ... }) or getByRole('button') or with regex name: /Sign in/i
  const getByRoleMatch = s.match(/\.getByRole\s*\(\s*["']([^"']+)["']\s*(?:,\s*\{([^}]*)\}\s*)?\)/);
  if (getByRoleMatch) {
    const role = (getByRoleMatch[1] ?? "").toLowerCase().trim();
    const options = (getByRoleMatch[2] ?? "").trim();
    if (role) {
      const name = options ? parseNameFromOptionsObjectLiteral(options) : null;
      if (name instanceof RegExp) {
        return { kind: "role", role, name };
      }
      const nameStr = typeof name === "string" ? name.trim() : "";
      return { kind: "role", role, name: nameStr || RECORDED_FALLBACK };
    }
  }

  // getByPlaceholder('Enter email')
  const getByPlaceholderMatch = s.match(/\.getByPlaceholder\s*\(\s*["']([^"']*)["']\s*\)/);
  if (getByPlaceholderMatch) {
    const placeholder = getByPlaceholderMatch[1]!.trim();
    if (placeholder) {
      return { kind: "placeholder", placeholder };
    }
  }

  // getByText('Sign in') or getByText("Sign in")
  const getByTextMatch = s.match(/\.getByText\s*\(\s*["']([^"']*)["']\s*\)/);
  if (getByTextMatch) {
    const text = getByTextMatch[1]!.trim();
    if (text) {
      return { kind: "text", text };
    }
  }

  // getByTitle('Close')
  const getByTitleMatch = s.match(/\.getByTitle\s*\(\s*["']([^"']*)["']\s*\)/);
  if (getByTitleMatch) {
    const title = getByTitleMatch[1]!.trim();
    if (title) {
      return { kind: "title", title };
    }
  }

  return null;
}

/** Playwright action from recorder (actionAdded event data.action). */
export interface PlaywrightRecordedAction {
  name: string;
  selector?: string;
  text?: string;
  options?: string[];
  signals?: unknown[];
}

/**
 * Convert a Playwright recorder selector string to our Locator.
 * Playwright selectors can be internal format (e.g. role=button[name="Accept"] or internal:...).
 * We try simple patterns; otherwise use text locator so the step is preserved.
 */
export function playwrightSelectorToLocator(selector: string | undefined): Locator {
  const s = (selector ?? "").trim();
  if (!s) {
    return { kind: "text", text: RECORDED_FALLBACK };
  }

  // Recorder selectors can be chained: "internal:role=button >> internal:text=\"Save\" >> nth=0"
  // Prefer the most specific chunk that yields a stable locator.
  const chunks = s.split(">>").map((c) => c.trim()).filter(Boolean);
  const all = chunks.length ? chunks.join(" >> ") : s;

  // internal:text="Sign in"
  for (const c of chunks.length ? chunks : [s]) {
    const internalTextMatch = c.match(/internal:text\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (internalTextMatch) {
      const text = (internalTextMatch[1] ?? internalTextMatch[2] ?? "").trim();
      if (text) {
        return { kind: "text", text };
      }
    }
  }

  const labelFromSelector = extractLabelFromSelector(s);
  if (labelFromSelector) {
    return { kind: "label", label: labelFromSelector };
  }

  // placeholder=...
  const placeholderMatch =
    all.match(/placeholder=(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/i) ??
    all.match(/internal:attr\s*=\s*\[\s*placeholder\s*=\s*(?:"([^"]*)"|'([^']*)')\s*]/i);
  if (placeholderMatch) {
    const placeholder = (placeholderMatch[1] ?? placeholderMatch[2] ?? placeholderMatch[3] ?? "").trim();
    if (placeholder) {
      return { kind: "placeholder", placeholder };
    }
  }

  // title=... (e.g. internal:attr=[title="Close"])
  const titleMatch =
    all.match(/title=(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/i) ??
    all.match(/internal:attr\s*=\s*\[\s*title\s*=\s*(?:"([^"]*)"|'([^']*)')\s*]/i);
  if (titleMatch) {
    const title = (titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? "").trim();
    if (title) {
      return { kind: "title", title };
    }
  }

  // Playwright internal format sometimes has role=button[name="..."] style (from asLocator)
  // or getByRole('button', { name: '...' }) in code - selector might be internal:attr=...
  // Try aria-like: role=button[name="Accept"] or similar
  const roleNameMatch = all.match(/role=([a-z]+)(?:\[name=(?:"([^"]*)"|'([^']*)')])?/i);
  if (roleNameMatch) {
    const role = roleNameMatch[1]!.toLowerCase();
    const name = (roleNameMatch[2] ?? roleNameMatch[3] ?? "").trim();
    if (role && name) {
      return { kind: "role", role, name };
    }
    if (role) {
      // If role has no accessible name, try to salvage has-text/text filters before falling back.
      const hasTextMatch = all.match(/has-text\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\]]+))/i);
      const text = (hasTextMatch?.[1] ?? hasTextMatch?.[2] ?? hasTextMatch?.[3] ?? "").replace(/^["']|["']$/g, "").trim();
      if (text) {
        return { kind: "text", text };
      }
      return { kind: "role", role, name: RECORDED_FALLBACK };
    }
  }

  // text=... or has-text=...
  const textMatch = all.match(/(?:text|has-text)=(.+)/i);
  if (textMatch) {
    const text = textMatch[1]!.replace(/^["']|["']$/g, "").trim();
    if (text) {
      return { kind: "text", text };
    }
  }

  // Fallback: use selector as text so step is not dropped; user can refine in YAML
  return { kind: "text", text: all.length > 60 ? all.slice(0, 57) + "..." : all };
}

/**
 * Resolve locator: prefer label from selector (aria-label), then generated code, then selector parsing.
 */
function resolveLocator(code: string | undefined, selector: string | undefined): Locator {
  const labelFromSelector = extractLabelFromSelector(selector);
  if (labelFromSelector) {
    return { kind: "label", label: labelFromSelector };
  }
  const fromCode = parseCodeToLocator(code);
  if (fromCode) {
    return fromCode;
  }
  return playwrightSelectorToLocator(selector);
}

/**
 * Map a Playwright recorded action (from actionAdded event) to a DemoStep-like object, or null to skip.
 * Pass the generated code string when available so we extract role/name, label, text, etc.
 */
export function playwrightActionToDemoStep(
  action: PlaywrightRecordedAction,
  code?: string
): { action: "click" | "type"; locator?: Locator; value?: string } | null {
  const name = action.name;
  const selector = action.selector;
  const locator = resolveLocator(code, selector);

  if (isRecordedFallbackLocator(locator)) {
    const key = `${name}|${locator.kind}|${typeof (locator as any).name === "string" ? (locator as any).name : ""}|${selector ?? ""}|${
      code ?? ""
    }`;
    warnOnce(
      key,
      "[demo-maker][record] locator fallback to (recorded). Improve selector patterns or app a11y (missing accessible name/text).",
      {
        action: name,
        selector: selector ? truncate(selector) : "",
        code: code ? truncate(code) : "",
        locator,
      }
    );
  }

  switch (name) {
    case "click":
      return { action: "click", locator };
    case "fill":
      return {
        action: "type",
        locator,
        value: (action.text ?? "").trim(),
      };
    case "press":
      return { action: "click", locator };
    case "check":
    case "uncheck":
      return { action: "click", locator };
    case "select":
      return {
        action: "type",
        locator,
        value: (action.options ?? [])[0] ?? "",
      };
    case "hover":
      return { action: "click", locator };
    default:
      return null;
  }
}
