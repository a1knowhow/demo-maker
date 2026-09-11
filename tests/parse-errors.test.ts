import { describe, it, expect } from "vitest";
import { parseScenario } from "../src/parse";
import { loadScenario } from "../src/load";

describe("demo-maker parse validation errors", () => {
  it("includes source file, scenario name, and step fields", () => {
    const yaml = `
name: wf-create
base_url: http://localhost:2000/
steps:
  - action: fill
    locator:
      not-a-locator: oops
    value: hello
`;
    expect(() => parseScenario(yaml, { sourceFile: "/cases/04.wf-create.yaml" })).toThrow(
      /Step 1 in \/cases\/04\.wf-create\.yaml \(scenario "wf-create"\)/
    );
    expect(() => parseScenario(yaml, { sourceFile: "/cases/04.wf-create.yaml" })).toThrow(
      /unrecognized locator key\(s\): not-a-locator/
    );
    expect(() => parseScenario(yaml, { sourceFile: "/cases/04.wf-create.yaml" })).toThrow(
      /step: action=fill, value=hello, locator=/
    );
  });

  it("accepts aria-label as a locator alias for label", () => {
    const yaml = `
name: agent
base_url: http://localhost:2000/
steps:
  - action: fill
    locator:
      aria-label: Step Description
    value: Summarise results
`;
    const parsed = parseScenario(yaml);
    const step = parsed.steps[0] as { locator?: { kind: string; label: string } };
    expect(step.locator).toEqual({ kind: "label", label: "Step Description" });
  });

  it("loadScenario attributes errors to imported file path", () => {
    const main = `
name: main
base_url: http://localhost:2000/
steps:
  - import: child.yaml
`;
    const child = `
name: child
base_url: http://localhost:2000/
steps:
  - action: fill
    value: missing locator
`;
    const fs = (path: string) => {
      if (path === "/fixture/main.yaml") return main;
      if (path === "/fixture/child.yaml") return child;
      throw new Error(`ENOENT ${path}`);
    };
    expect(() => loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs })).toThrow(
      /Step 1 in \/fixture\/child\.yaml \(scenario "child"\)/
    );
    expect(() => loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs })).toThrow(
      /step: action=fill, value=missing locator/
    );
  });
});
