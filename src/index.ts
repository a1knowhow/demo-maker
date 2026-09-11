/**
 * Entry point for CLI and local scripts. Exports parseScenario, loadScenario, runScenario, createDemoLogger, resolveVariables, and types.
 */

export type {
  ActionType,
  AuthConfig,
  CaptionStyle,
  DemoScenario,
  DemoStep,
  IDemoLogger,
  IDemoRunner,
  IScenarioParser,
  Locator,
  ParsedScenario,
  RunContext,
  RunResult,
  StepImport,
  StepOrImport,
  StepResult,
  TimingExport,
  TimingStepEntry,
  VideoConfig,
} from "./types";
export {
  createDemoLogger,
  formatLocalTimeHHMMSS,
  formatStepFailedLogLine,
  formatStepProgressLogLine,
} from "./logger";
export type { StepProgressLogParts } from "./logger";
export { loadScenario } from "./load";
export type { LoadScenarioOptions } from "./load";
export { resolveVariables, defaultVariableResolver } from "./variables";
export type { IVariableResolver } from "./variables";
export { parseScenario, type ParseScenarioOptions } from "./parse";
export { runScenario, runScenarioOnExistingPage, sliceScenarioByEndStep } from "./runner";
export { formatYouTubeChapters } from "./export-chapters";
export type {
  RunScenarioOnPageOptions,
  RunScenarioOnPageResult,
  RunScenarioOptions,
} from "./runner";

export {
  applyUrlCapture,
  buildUrlCaptureHooks,
  createRegexUrlCapture,
  loadUrlCaptureRulesFile,
  parseCaptureFromUrlArg,
} from "./url-capture";
export type { UrlCaptureHook } from "./url-capture";
export type { UrlCaptureRule } from "./types";

