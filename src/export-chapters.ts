/**
 * Emit YouTube chapter timestamps from a demo-maker timing.json file.
 *
 * Usage:
 *   npx tsx demo-maker/export-chapters.ts path/to/video.timing.json
 *   npx tsx demo-maker/export-chapters.ts output/videos   # uses newest *.timing.json in dir
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import type { TimingExport } from "./types";

function formatChapterTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function chapterLabel(step: TimingExport["steps"][number]): string | undefined {
  if (step.caption?.trim()) {
    return step.caption.trim();
  }
  const msg = step.message?.trim() ?? "";
  if (/pre-video/i.test(msg)) {
    return undefined;
  }
  const scene = msg.match(/──\s*Scene\s*\d+:\s*(.+)/i);
  if (scene?.[1]) {
    return scene[1].trim();
  }
  if (msg.startsWith("──")) {
    return msg.replace(/^──\s*/, "").trim();
  }
  return undefined;
}

export function formatYouTubeChapters(timing: TimingExport): string {
  const lines: string[] = [];
  const seen = new Set<number>();

  for (const step of timing.steps) {
    if (step.excluded) continue;
    const label = chapterLabel(step);
    if (!label) continue;
    const at = Math.floor(step.startSec);
    if (seen.has(at)) continue;
    seen.add(at);
    lines.push(`${formatChapterTime(step.startSec)} ${label}`);
  }

  if (lines.length === 0) {
    return "# No chapter markers found (add caption: or Scene log messages on key steps)";
  }
  return lines.join("\n");
}

function findNewestTimingInDir(dir: string): string | undefined {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".timing.json"))
    .map((f) => join(dir, f));
  if (files.length === 0) return undefined;
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0];
}

export function exportChaptersMain(argv: string[] = process.argv): number {
  const arg = argv[2];
  if (!arg) {
    console.error("Usage: npx tsx demo-maker/export-chapters.ts <timing.json | directory>");
    return 1;
  }

  const resolved = resolve(process.cwd(), arg);
  let timingPath = resolved;
  try {
    const st = statSync(resolved);
    if (st.isDirectory()) {
      const found = findNewestTimingInDir(resolved);
      if (!found) {
        console.error(`No *.timing.json files in ${resolved}`);
        return 1;
      }
      timingPath = found;
    }
  } catch {
    console.error(`Path not found: ${resolved}`);
    return 1;
  }

  const raw = readFileSync(timingPath, "utf8");
  const timing = JSON.parse(raw) as TimingExport;
  console.log(`# ${timing.scenarioName} (${timing.durationSec}s)`);
  console.log(`# source: ${timingPath}`);
  console.log("");
  console.log(formatYouTubeChapters(timing));
  return 0;
}

