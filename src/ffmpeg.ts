/**
 * ffmpeg helpers for demo-maker video post-processing (splice excluded ranges).
 */

import { spawnSync } from "child_process";

export interface TimeRangeSec {
  startSec: number;
  endSec: number;
}

export interface KeepSegment {
  startSec: number;
  endSec: number;
}

/** Sort and merge overlapping exclude ranges. */
export function normalizeExcludeRanges(ranges: TimeRangeSec[]): TimeRangeSec[] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges]
    .map((r) => ({
      startSec: Math.max(0, r.startSec),
      endSec: Math.max(r.startSec, r.endSec),
    }))
    .sort((a, b) => a.startSec - b.startSec);

  const merged: TimeRangeSec[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, r.endSec);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/** Build keep-segments from full duration and exclude ranges. */
export function buildKeepSegments(durationSec: number, excludeRanges: TimeRangeSec[]): KeepSegment[] {
  const excludes = normalizeExcludeRanges(excludeRanges);
  const keeps: KeepSegment[] = [];
  let cursor = 0;

  for (const ex of excludes) {
    if (ex.startSec > cursor + 0.01) {
      keeps.push({ startSec: cursor, endSec: ex.startSec });
    }
    cursor = Math.max(cursor, ex.endSec);
  }

  if (cursor < durationSec - 0.01) {
    keeps.push({ startSec: cursor, endSec: durationSec });
  }

  return keeps.filter((k) => k.endSec > k.startSec + 0.01);
}

/** Map a timestamp on the original timeline to the spliced timeline. */
export function remapTimelineSec(tSec: number, excludeRanges: TimeRangeSec[]): number {
  const excludes = normalizeExcludeRanges(excludeRanges);
  let removed = 0;
  for (const ex of excludes) {
    if (tSec <= ex.startSec) {
      break;
    }
    if (tSec >= ex.endSec) {
      removed += ex.endSec - ex.startSec;
    } else {
      removed += tSec - ex.startSec;
      break;
    }
  }
  return Math.max(0, tSec - removed);
}

export interface SpliceResult {
  ok: boolean;
  stderr?: string;
  removedSec?: number;
}

/**
 * Remove exclude ranges from a video file using ffmpeg trim+concat.
 * Re-encodes video (required for mid-stream cuts). No audio track is expected on Playwright webm.
 */
export function spliceVideoExcludingRanges(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  excludeRanges: TimeRangeSec[]
): SpliceResult {
  const excludes = normalizeExcludeRanges(excludeRanges);
  if (excludes.length === 0) {
    return { ok: true, removedSec: 0 };
  }

  const keeps = buildKeepSegments(durationSec, excludes);
  if (keeps.length === 0) {
    return { ok: false, stderr: "splice would remove entire video" };
  }

  const removedSec = excludes.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);

  if (keeps.length === 1 && excludes.length === 1 && keeps[0]!.startSec === 0 && keeps[0]!.endSec >= durationSec - removedSec - 0.05) {
    // Single leading or trailing keep only — use simple trim
    const k = keeps[0]!;
    const ff = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-ss",
        String(k.startSec),
        "-to",
        String(k.endSec),
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "2M",
        outputPath,
      ],
      { encoding: "utf8" }
    );
    if (ff.status === 0) {
      return { ok: true, removedSec };
    }
    return { ok: false, stderr: ff.stderr?.slice(-800) ?? String(ff.error) };
  }

  const filterParts: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < keeps.length; i++) {
    const k = keeps[i]!;
    filterParts.push(
      `[0:v]trim=start=${k.startSec}:end=${k.endSec},setpts=PTS-STARTPTS[v${i}]`
    );
    labels.push(`[v${i}]`);
  }
  filterParts.push(`${labels.join("")}concat=n=${keeps.length}:v=1:a=0[outv]`);

  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[outv]",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "2M",
      outputPath,
    ],
    { encoding: "utf8" }
  );

  if (ff.status === 0) {
    return { ok: true, removedSec };
  }
  return { ok: false, stderr: ff.stderr?.slice(-800) ?? String(ff.error) };
}
