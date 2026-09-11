/**
 * Pluggable URL → variable capture during scenario runs.
 *
 * On navigate (and after some steps), matching URL path segments can be stored as
 * `{{ variable }}` values for later steps — e.g. capture an id from `/workspace/abc/…`.
 *
 * Library default: no hooks. Configure via scenario `url_capture`, CLI
 * `--capture-from-url` / `--url-capture-file`, or `urlCaptureHooks` in options.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import type { UrlCaptureRule } from "./types";

export type { UrlCaptureRule };

export type UrlCaptureHook = (url: string, captured: Record<string, string>) => void;

/** Build a hook from named regex rules (first capture group → variable). */
export function createRegexUrlCapture(rules: UrlCaptureRule[]): UrlCaptureHook {
  const compiled = rules.map((r) => {
    const variable = r.variable.trim();
    if (!variable) {
      throw new Error("url_capture rule variable must be non-empty");
    }
    const re = typeof r.pattern === "string" ? new RegExp(r.pattern) : r.pattern;
    return { variable, re };
  });
  return (url, captured) => {
    for (const { variable, re } of compiled) {
      const m = url.match(re);
      if (m?.[1]) {
        captured[variable] = m[1];
      }
    }
  };
}

/** Parse CLI form: `variable=pattern` (pattern is RegExp source). */
export function parseCaptureFromUrlArg(raw: string): UrlCaptureRule {
  const eq = raw.indexOf("=");
  if (eq <= 0) {
    throw new Error(
      `Invalid --capture-from-url "${raw}". Expected VARIABLE=regex-source (first group is captured).`
    );
  }
  const variable = raw.slice(0, eq).trim();
  const pattern = raw.slice(eq + 1);
  if (!variable || !pattern) {
    throw new Error(
      `Invalid --capture-from-url "${raw}". Expected VARIABLE=regex-source (first group is captured).`
    );
  }
  return { variable, pattern };
}

/** Load rules from a JSON file: `[{ "variable": "id", "pattern": "/foo/([^/]+)" }, …]`. */
export function loadUrlCaptureRulesFile(filePath: string, cwd: string = process.cwd()): UrlCaptureRule[] {
  const abs = resolve(cwd, filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to read url-capture file ${abs}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`url-capture file must be a JSON array: ${abs}`);
  }
  const rules: UrlCaptureRule[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") {
      throw new Error(`url-capture[${i}] must be an object in ${abs}`);
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.variable !== "string" || typeof rec.pattern !== "string") {
      throw new Error(`url-capture[${i}] needs string "variable" and "pattern" in ${abs}`);
    }
    rules.push({ variable: rec.variable, pattern: rec.pattern });
  }
  return rules;
}

export function applyUrlCapture(
  url: string,
  captured: Record<string, string>,
  hooks: UrlCaptureHook[] | undefined
): void {
  if (!hooks?.length) return;
  for (const hook of hooks) {
    hook(url, captured);
  }
}

/** Merge scenario rules + CLI rules into hooks (CLI rules appended after scenario). */
export function buildUrlCaptureHooks(options: {
  scenarioRules?: UrlCaptureRule[];
  cliRules?: UrlCaptureRule[];
}): UrlCaptureHook[] | undefined {
  const rules = [...(options.scenarioRules ?? []), ...(options.cliRules ?? [])];
  if (rules.length === 0) return undefined;
  return [createRegexUrlCapture(rules)];
}
