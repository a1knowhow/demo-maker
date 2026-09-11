/**
 * Parse Puppeteer Replay / Chrome DevTools Recorder selectors into demo-maker Locator.
 * Supports aria/ and text/; css/xpath get a fallback locator + note.
 */

import type { Locator } from "./types";

export interface SelectorToLocatorResult {
  locator: Locator;
  note?: string;
}

/**
 * Parse a single Replay selector string into our Locator if possible.
 * - aria/role[name="..."] or aria/role[name='...'] -> { kind: "role", role, name }
 * - text=... or text/... -> { kind: "text", text }
 * - css=... / xpath=... -> fallback { kind: "text", text: selector } with note
 */
function parseOneSelector(selector: string): SelectorToLocatorResult | null {
  const s = selector.trim();
  if (!s) {
    return null;
  }

  // aria/button[name="Sign in"] or aria/button[name='Sign in']
  const ariaMatch = s.match(/^aria\/([a-zA-Z]+)(?:\[name=(?:"([^"]*)"|'([^']*)')])?$/);
  if (ariaMatch) {
    const role = ariaMatch[1]!;
    const name = ariaMatch[2] ?? ariaMatch[3] ?? "";
    return { locator: { kind: "role", role, name } };
  }

  // text=Sign in or text/Sign in (some formats use /)
  if (s.startsWith("text=")) {
    return { locator: { kind: "text", text: s.slice(5).trim() } };
  }
  if (s.startsWith("text/")) {
    return { locator: { kind: "text", text: s.slice(5).trim() } };
  }

  // css= or xpath=: no direct mapping; return fallback so step is not dropped
  if (s.startsWith("css=") || s.startsWith("xpath=")) {
    return {
      locator: { kind: "text", text: `(replace: ${s})` },
      note: `Original selector: ${s}. Replace locator in YAML.`,
    };
  }

  return null;
}

/**
 * Given Replay selectors array, return our Locator + optional note.
 * Tries each selector in order; returns first successful aria/ or text/ parse, or fallback for css/xpath.
 */
export function replaySelectorsToLocator(selectors: string[]): SelectorToLocatorResult | null {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return null;
  }

  for (const sel of selectors) {
    const parsed = parseOneSelector(typeof sel === "string" ? sel : String(sel));
    if (parsed) {
      return parsed;
    }
  }

  return null;
}
