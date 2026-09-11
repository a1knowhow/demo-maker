import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatLocalTimeHHMMSS,
  formatStepFailedLogLine,
  formatStepProgressLogLine,
} from "../src/logger";

describe("demo-maker logger formatting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formatLocalTimeHHMMSS pads components", () => {
    expect(formatLocalTimeHHMMSS(new Date(2026, 3, 14, 22, 5, 9))).toBe("22:05:09");
  });

  it("formatStepProgressLogLine plain output when NO_COLOR is set", () => {
    vi.stubEnv("NO_COLOR", "1");
    const line = formatStepProgressLogLine({
      stepIndex: 8,
      stepTotal: 37,
      action: "wait",
      hint: "3500ms",
    });
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} - Step  8\/37: wait\s+- 3500ms$/);
  });

  it("formatStepProgressLogLine omits hint tail when absent", () => {
    vi.stubEnv("NO_COLOR", "1");
    const line = formatStepProgressLogLine({
      stepIndex: 1,
      stepTotal: 5,
      action: "navigate",
    });
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} - Step 1\/5: navigate\s+$/);
  });

  it("formatStepFailedLogLine plain shape when NO_COLOR is set", () => {
    vi.stubEnv("NO_COLOR", "1");
    const line = formatStepFailedLogLine(3, "timeout");
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} - Step 3 failed: timeout$/);
  });
});
