import { describe, it, expect } from "vitest";
import { resolve } from "path";
import {
  composeRecordedOnlyScenario,
  relativeImportPath,
  parsedScenarioToYaml,
} from "../src/recording-to-yaml";
import type { ParsedScenario } from "../src/types";

const loginBase: ParsedScenario = {
  name: "login",
  description: "Login once",
  base_url: "http://localhost:2000/",
  steps: [
    { action: "navigate", url: "/" },
    { action: "click", locator: { kind: "role", role: "button", name: "Log in" } },
  ],
};

describe("recording-to-yaml composeRecordedOnlyScenario", () => {
  it("relativeImportPath uses forward slashes in same directory", () => {
    const dir = "/cases/demo-maker";
    expect(relativeImportPath(`${dir}/recorded-2026.yaml`, `${dir}/01.login.yaml`)).toBe(
      "01.login.yaml",
    );
  });

  it("outputs imports and recorded steps only", () => {
    const saveTo = resolve("/cases/demo-maker/recorded-2026-06-18.yaml");
    const continueFrom = resolve("/cases/demo-maker/01.login.yaml");
    const recorded = [
      { action: "click" as const, locator: { kind: "label" as const, label: "Settings" } },
      { action: "wait" as const, timeout_ms: 1000 },
    ];

    const composed = composeRecordedOnlyScenario(loginBase, recorded, {
      importPath: relativeImportPath(saveTo, continueFrom),
      name: "recorded-2026-06-18",
    });

    expect(composed.name).toBe("recorded-2026-06-18");
    expect(composed.description).toBe("");
    expect(composed.imports).toEqual(["01.login.yaml"]);
    expect(composed.steps).toHaveLength(2);
    const first = composed.steps[0];
    expect(first && "action" in first ? first.action : undefined).toBe("click");
    expect(composed.auth).toBeUndefined();
    expect(composed.step_delay_ms).toBe(500);

    const yaml = parsedScenarioToYaml(composed);
    expect(yaml).toContain("imports:");
    expect(yaml).toContain("01.login.yaml");
    expect(yaml).not.toContain("Log in");
    expect(yaml).toContain("label: Settings");
  });
});
