# Library API

Purpose: Use demo-maker from TypeScript instead of the CLI.

Package entry: `@a1knowhow/demo-maker` (see `src/index.ts`).

```ts
import {
  loadScenario,
  runScenario,
  createDemoLogger,
  createRegexUrlCapture,
  type RunContext,
} from "@a1knowhow/demo-maker";

const scenario = loadScenario("./scenarios/demo.yaml", { cwd: process.cwd() });

const context: RunContext = {
  auth: {
    email: process.env.E2E_TEST_USER_EMAIL ?? "",
    password: process.env.E2E_TEST_USER_PASSWORD ?? "",
  },
  // Prefer explicit keys or an env file — avoid spreading all of process.env
  variables: {
    BASE_URL: scenario.base_url,
    ...(process.env.DEMO_WORKSPACE1
      ? { DEMO_WORKSPACE1: process.env.DEMO_WORKSPACE1 }
      : {}),
  },
};

const result = await runScenario(scenario, context, {
  logger: createDemoLogger("info"),
  headless: true,
  cwd: process.cwd(),
  urlCaptureHooks: [
    createRegexUrlCapture([
      { variable: "workspace_id", pattern: String.raw`/workspace/([^/]+)` },
    ]),
  ],
});

if (!result.success) {
  throw new Error(result.error);
}
```

## Useful exports

| Export | Role |
|--------|------|
| `loadScenario` / `parseScenario` | YAML → scenario |
| `runScenario` / `runScenarioOnExistingPage` | Execute |
| `sliceScenarioByEndStep` | Truncate steps |
| `resolveVariables` | `{{ }}` helper |
| `formatYouTubeChapters` | Timing → chapter text |
| `createRegexUrlCapture` / `buildUrlCaptureHooks` | URL → variable capture |
| Types | `DemoScenario`, `DemoStep`, `Locator`, `RunContext`, `UrlCaptureRule`, … |

## Options highlights

`RunScenarioOptions`: `logger`, `headless`, `cwd`, `storageStatePath`, `saveStorageStatePath`, `failFast`, `endStep`, `pauseAtEnd`, `debugDir`, `urlCaptureHooks`.

Relative paths in YAML (`video.dir`, file uploads) resolve against `cwd` (default `process.cwd()`).
