import { describe, it, expect } from "vitest";
import { formatYouTubeChapters } from "../src/export-chapters";
import type { TimingExport } from "../src/types";

describe("formatYouTubeChapters", () => {
  const timing: TimingExport = {
    scenarioName: "consultant-demo",
    durationSec: 120,
    steps: [
      { index: 1, action: "log", message: "── Pre-video setup", startSec: 0, endSec: 2 },
      { index: 5, action: "log", message: "── Scene 1: Instant retrieval", startSec: 8, endSec: 9 },
      { index: 10, action: "click", caption: "Ask in plain English", startSec: 25, endSec: 26 },
      { index: 20, action: "log", message: "── Scene 2: Proposal Section Drafter", startSec: 70, endSec: 71 },
    ],
  };

  it("formats scene logs and captions as chapter lines", () => {
    const out = formatYouTubeChapters(timing);
    expect(out).toContain("0:08 Instant retrieval");
    expect(out).toContain("0:25 Ask in plain English");
    expect(out).toContain("1:10 Proposal Section Drafter");
    expect(out).not.toContain("Pre-video");
  });

  it("skips excluded steps", () => {
    const withExcluded: TimingExport = {
      ...timing,
      steps: [
        { index: 1, action: "log", message: "── Scene 1: Visible", startSec: 0, endSec: 2 },
        {
          index: 2,
          action: "wait",
          caption: "Should not appear",
          startSec: 10,
          endSec: 70,
          excluded: true,
        },
        { index: 3, action: "log", message: "── Scene 2: After cut", startSec: 12, endSec: 13 },
      ],
    };
    const out = formatYouTubeChapters(withExcluded);
    expect(out).toContain("0:00 Visible");
    expect(out).toContain("0:12 After cut");
    expect(out).not.toContain("Should not appear");
  });
});
