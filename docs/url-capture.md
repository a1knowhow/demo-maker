# URL capture

Purpose: Store path segments from the browser URL as `{{ variables }}` during a run.

## What it does

When the runner navigates (and after some steps), it can match the current page URL against regex rules. Each rule’s **first capturing group** is written to a named variable for later steps.

Example: after opening `/projects/abc123/settings`, capture `project_id=abc123` and use `{{ project_id }}` in the next URL or fill.

No rules by default — nothing is captured until you configure them.

## Scenario YAML

```yaml
name: my-demo
base_url: https://app.example/
url_capture:
  - variable: workspace_id
    pattern: "/workspace/([^/]+)(?:/|$)"
  - variable: document_id
    pattern: "/workspace/[^/]+/doc/([^/]+)"
steps:
  - action: navigate
    url: /workspace/…   # after load, workspace_id is set if the URL matches
  - action: navigate
    url: "/workspace/{{ workspace_id }}/doc/{{ document_id }}/edit"
```

`pattern` is a **RegExp source string** (not slash-wrapped YAML regex). Entry-file only (imports do not contribute `url_capture`).

## CLI

Repeatable flag:

```bash
demo-maker run demo.yaml \
  --capture-from-url 'workspace_id=/workspace/([^/]+)(?:/|$)' \
  --capture-from-url 'document_id=/workspace/[^/]+/doc/([^/]+)'
```

Or a JSON file:

```json
[
  { "variable": "workspace_id", "pattern": "/workspace/([^/]+)(?:/|$)" },
  { "variable": "document_id", "pattern": "/workspace/[^/]+/doc/([^/]+)" }
]
```

```bash
demo-maker run demo.yaml --url-capture-file=./url-capture.json
```

CLI rules are applied **after** scenario `url_capture` (same variable name overwrites when both match later).

## Library

```ts
import { runScenario, createRegexUrlCapture } from "@a1knowhow/demo-maker";

await runScenario(scenario, context, {
  urlCaptureHooks: [
    createRegexUrlCapture([
      { variable: "org_id", pattern: String.raw`/orgs/([^/]+)` },
    ]),
  ],
});
```

## Related

- [Variables](./variables.md)
- [CLI](./cli.md)
- [Library API](./library-api.md)
