/**
 * Load scenario from file with import expansion: resolves top-level imports and
 * step-level import directives, flattens to a single steps array, detects circular imports.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import type { DemoScenario, DemoStep, ParsedScenario, StepOrImport } from "./types";
import { parseScenario } from "./parse";

export interface LoadScenarioOptions {
  /** Working directory for resolving the entry path. Default process.cwd(). */
  cwd?: string;
  /** Custom file reader (e.g. for tests). Default readFileSync. */
  readFile?: (absolutePath: string) => string;
}

function isStepImport(s: StepOrImport): s is { import: string } {
  return typeof s === "object" && s !== null && "import" in s && typeof (s as { import: string }).import === "string";
}

/**
 * Load and expand a scenario from a file path. Resolves imports relative to each file's directory.
 * Returns a DemoScenario with flattened steps (no import directives). Throws on circular import.
 */
export function loadScenario(
  entryPath: string,
  options: LoadScenarioOptions = {},
  visited: Set<string> = new Set()
): DemoScenario {
  const cwd = options.cwd ?? process.cwd();
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf-8"));
  const absolutePath = resolve(cwd, entryPath);

  if (visited.has(absolutePath)) {
    throw new Error(`Circular import: ${absolutePath}`);
  }
  visited.add(absolutePath);

  let content: string;
  try {
    content = readFile(absolutePath);
  } catch (err) {
    visited.delete(absolutePath);
    throw new Error(
      `Failed to read scenario file ${absolutePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: ParsedScenario;
  try {
    parsed = parseScenario(content, { sourceFile: absolutePath });
  } catch (err) {
    visited.delete(absolutePath);
    throw err;
  }

  const baseDir = dirname(absolutePath);
  const effectiveSteps: DemoStep[] = [];

  if (parsed.imports && parsed.imports.length > 0) {
    for (const importPath of parsed.imports) {
      const resolvedImport = resolve(baseDir, importPath);
      const child = loadScenario(resolvedImport, { ...options, cwd: baseDir }, visited);
      effectiveSteps.push(...child.steps);
    }
  }

  for (const item of parsed.steps) {
    if (isStepImport(item)) {
      const resolvedImport = resolve(baseDir, item.import);
      const child = loadScenario(resolvedImport, { ...options, cwd: baseDir }, visited);
      effectiveSteps.push(...child.steps);
    } else {
      effectiveSteps.push(item);
    }
  }

  visited.delete(absolutePath);

  const scenario: DemoScenario = {
    name: parsed.name,
    description: parsed.description,
    base_url: parsed.base_url,
    steps: effectiveSteps,
  };
  if (parsed.title !== undefined) {
    scenario.title = parsed.title;
  }
  if (parsed.seed_data !== undefined) {
    scenario.seed_data = parsed.seed_data;
  }
  if (parsed.auth !== undefined) {
    scenario.auth = parsed.auth;
  }
  if (parsed.video !== undefined) {
    scenario.video = parsed.video;
  }
  if (parsed.screenshots !== undefined) {
    scenario.screenshots = parsed.screenshots;
  }
  if (parsed.device_scale_factor !== undefined) {
    scenario.device_scale_factor = parsed.device_scale_factor;
  }
  if (parsed.audio !== undefined) {
    scenario.audio = parsed.audio;
  }
  if (parsed.action_timeout_ms !== undefined) {
    scenario.action_timeout_ms = parsed.action_timeout_ms;
  }
  if (parsed.storage_state !== undefined) {
    scenario.storage_state = parsed.storage_state;
  }
  if (parsed.save_storage_state !== undefined) {
    scenario.save_storage_state = parsed.save_storage_state;
  }
  if (parsed.step_delay_ms !== undefined) {
    scenario.step_delay_ms = parsed.step_delay_ms;
  }
  if (parsed.slow_mo_ms !== undefined) {
    scenario.slow_mo_ms = parsed.slow_mo_ms;
  }
  if (parsed.typing_delay_ms !== undefined) {
    scenario.typing_delay_ms = parsed.typing_delay_ms;
  }
  if (parsed.post_click_delay_ms !== undefined) {
    scenario.post_click_delay_ms = parsed.post_click_delay_ms;
  }
  if (parsed.navigate_hold_ms !== undefined) {
    scenario.navigate_hold_ms = parsed.navigate_hold_ms;
  }
  if (parsed.pre_action_delay_ms !== undefined) {
    scenario.pre_action_delay_ms = parsed.pre_action_delay_ms;
  }
  if (parsed.metadata !== undefined) {
    scenario.metadata = parsed.metadata;
  }
  if (parsed.url_capture !== undefined) {
    scenario.url_capture = parsed.url_capture;
  }

  return scenario;
}
