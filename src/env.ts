/**
 * Load .env-style files for auth and variables. Shared by run CLI and record CLI.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Parse a .env-style file into key-value pairs. Supports KEY=VALUE, # comments, blank lines,
 * and quoted values ("value" or 'value').
 */
export function loadEnvFile(filePath: string): Record<string, string> {
  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    return {};
  }
  const content = readFileSync(resolved, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    result[key] = value;
  }
  return result;
}

export const DEMO_BASE_URL_ENV_KEY = "BASE_URL";

/**
 * Resolve demo base URL from env file (preferred) or process.env.
 */
export function resolveBaseUrlFromEnv(
  envFromFile: Record<string, string>,
  processEnv: Record<string, string | undefined> = process.env
): string | undefined {
  const fromFile = envFromFile[DEMO_BASE_URL_ENV_KEY]?.trim();
  if (fromFile) {
    return fromFile;
  }
  const fromProcess = processEnv[DEMO_BASE_URL_ENV_KEY]?.trim();
  return fromProcess || undefined;
}

/**
 * Override scenario.base_url from env file or CLI. CLI wins when set.
 */
export function applyBaseUrlOverride(
  scenario: { base_url: string },
  options: { envFromFile?: Record<string, string>; cliBaseUrl?: string }
): void {
  if (options.cliBaseUrl) {
    scenario.base_url = options.cliBaseUrl;
    return;
  }
  const resolved = resolveBaseUrlFromEnv(options.envFromFile ?? {});
  if (resolved) {
    scenario.base_url = resolved;
  }
}
