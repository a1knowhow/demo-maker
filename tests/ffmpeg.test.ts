import { describe, it, expect } from "vitest";
import {
  buildKeepSegments,
  normalizeExcludeRanges,
  remapTimelineSec,
} from "../src/ffmpeg";

describe("demo-maker ffmpeg helpers", () => {
  it("buildKeepSegments removes exclude ranges from timeline", () => {
    const keeps = buildKeepSegments(120, [{ startSec: 30, endSec: 90 }]);
    expect(keeps).toEqual([
      { startSec: 0, endSec: 30 },
      { startSec: 90, endSec: 120 },
    ]);
  });

  it("normalizeExcludeRanges merges overlaps", () => {
    const merged = normalizeExcludeRanges([
      { startSec: 10, endSec: 40 },
      { startSec: 35, endSec: 60 },
    ]);
    expect(merged).toEqual([{ startSec: 10, endSec: 60 }]);
  });

  it("remapTimelineSec subtracts excluded duration before timestamp", () => {
    const excludes = [{ startSec: 30, endSec: 90 }];
    expect(remapTimelineSec(25, excludes)).toBe(25);
    expect(remapTimelineSec(45, excludes)).toBe(30);
    expect(remapTimelineSec(100, excludes)).toBe(40);
  });
});
