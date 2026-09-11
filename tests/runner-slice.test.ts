import { describe, expect, it } from "vitest";
import { sliceScenarioByEndStep } from "../src/runner";
import type { DemoScenario } from "../src/types";

function makeScenario(stepCount: number): DemoScenario {
  return {
    name: "test",
    description: "",
    base_url: "http://localhost:2000/",
    steps: Array.from({ length: stepCount }, (_, i) => ({
      action: "wait" as const,
      timeout_ms: 100,
      caption: `step-${i + 1}`,
    })),
  };
}

describe("sliceScenarioByEndStep", () => {
  it("returns the same scenario when endStep is undefined", () => {
    const scenario = makeScenario(5);
    const sliced = sliceScenarioByEndStep(scenario);
    expect(sliced).toBe(scenario);
    expect(sliced.steps).toHaveLength(5);
  });

  it("returns the same scenario when endStep exceeds step count", () => {
    const scenario = makeScenario(3);
    const sliced = sliceScenarioByEndStep(scenario, 10);
    expect(sliced).toBe(scenario);
    expect(sliced.steps).toHaveLength(3);
  });

  it("truncates to endStep inclusive (1-based)", () => {
    const scenario = makeScenario(5);
    const sliced = sliceScenarioByEndStep(scenario, 2);
    expect(sliced.steps).toHaveLength(2);
    expect(sliced.steps[0]?.caption).toBe("step-1");
    expect(sliced.steps[1]?.caption).toBe("step-2");
    expect(sliced.name).toBe("test");
    expect(sliced.base_url).toBe("http://localhost:2000/");
  });

  it("ignores non-positive endStep", () => {
    const scenario = makeScenario(4);
    expect(sliceScenarioByEndStep(scenario, 0).steps).toHaveLength(4);
    expect(sliceScenarioByEndStep(scenario, -1).steps).toHaveLength(4);
  });
});
