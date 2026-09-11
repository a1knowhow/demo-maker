import { describe, it, expect } from "vitest";
import { parseScenario } from "../src/parse";
import type { DemoStep, StepImport } from "../src/types";

describe("demo-maker parse", () => {
  const minimalScenario = `
name: test
base_url: http://localhost:2000/
steps:
  - action: navigate
    url: /
`;

  it("parses optional title (YouTube / publish)", () => {
    const yaml = `
name: clip
title: "  My Video Title  "
base_url: http://localhost:2000/
steps: []
`;
    const parsed = parseScenario(yaml);
    expect(parsed.name).toBe("clip");
    expect(parsed.title).toBe("My Video Title");
  });

  it("parses scenario with no imports (steps only)", () => {
    const parsed = parseScenario(minimalScenario);
    expect(parsed.name).toBe("test");
    expect(parsed.base_url).toBe("http://localhost:2000/");
    expect(parsed.steps).toHaveLength(1);
    expect((parsed.steps[0] as DemoStep).action).toBe("navigate");
    expect((parsed.steps[0] as DemoStep).url).toBe("/");
    expect(parsed.imports).toBeUndefined();
  });

  it("parses top-level imports array", () => {
    const yaml = `
name: composed
base_url: http://localhost:2000/
imports:
  - login.yaml
  - create-workspace.yaml
steps:
  - action: click
    locator:
      role: link
      name: dashboard
`;
    const parsed = parseScenario(yaml);
    expect(parsed.imports).toEqual(["login.yaml", "create-workspace.yaml"]);
    expect(parsed.steps).toHaveLength(1);
    expect((parsed.steps[0] as DemoStep).action).toBe("click");
  });

  it("parses step-level import directive", () => {
    const yaml = `
name: composed
base_url: http://localhost:2000/
steps:
  - import: login.yaml
  - action: click
    locator:
      role: link
      name: dashboard
  - import: create-workspace.yaml
`;
    const parsed = parseScenario(yaml);
    expect(parsed.steps).toHaveLength(3);
    expect((parsed.steps[0] as StepImport).import).toBe("login.yaml");
    expect((parsed.steps[1] as DemoStep).action).toBe("click");
    expect((parsed.steps[2] as StepImport).import).toBe("create-workspace.yaml");
  });

  it("rejects non-array imports", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
imports: not-an-array
steps:
  - action: navigate
    url: /
`;
    expect(() => parseScenario(yaml)).toThrow('"imports" must be an array');
  });

  it("filters empty or non-string entries in imports", () => {
    const yaml = `
name: filtered
base_url: http://localhost:2000/
imports:
  - "  a.yaml  "
  - ""
  - b.yaml
steps: []
`;
    const parsed = parseScenario(yaml);
    expect(parsed.imports).toEqual(["a.yaml", "b.yaml"]);
  });

  it("parses locator with selector (e.g. file input)", () => {
    const yaml = `
name: upload
base_url: http://localhost:2000/
steps:
  - action: type
    locator:
      selector: input[type="file"]
    value: /path/to/file.pdf
`;
    const parsed = parseScenario(yaml);
    expect(parsed.steps).toHaveLength(1);
    const step = parsed.steps[0] as DemoStep;
    expect(step.action).toBe("type");
    expect(step.locator).toEqual({ kind: "selector", selector: 'input[type="file"]' });
    expect(step.value).toBe("/path/to/file.pdf");
  });

  it("parses select_confirm on fill", () => {
    const yaml = `
name: s
base_url: http://localhost:2000/
steps:
  - action: fill
    locator: { label: Workspace }
    value: "Acme"
    select_confirm: true
`;
    const parsed = parseScenario(yaml);
    const step = parsed.steps[0] as DemoStep;
    expect(step.select_confirm).toBe(true);
  });

  it("parses title_card and transition actions", () => {
    const yaml = `
name: polish
base_url: http://localhost:2000/
steps:
  - action: title_card
    text: "Scene one"
    hold_ms: 1500
  - action: transition
    fade_ms: 400
  - action: click
    locator: { role: button, name: Go }
    caption: "Next"
    caption_style: chapter
`;
    const parsed = parseScenario(yaml);
    expect(parsed.steps).toHaveLength(3);
    const title = parsed.steps[0] as DemoStep;
    expect(title.action).toBe("title_card");
    expect(title.text).toBe("Scene one");
    expect(title.hold_ms).toBe(1500);
    const trans = parsed.steps[1] as DemoStep;
    expect(trans.action).toBe("transition");
    expect(trans.fade_ms).toBe(400);
    const click = parsed.steps[2] as DemoStep;
    expect(click.caption_style).toBe("chapter");
  });

  it("rejects title_card without text", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: title_card
    text: "   "
`;
    expect(() => parseScenario(yaml)).toThrow('action "title_card" requires non-empty "text"');
  });

  it("parses wait until hidden with locator", () => {
    const yaml = `
name: wait-gone
base_url: http://localhost:2000/
steps:
  - action: wait
    until: hidden
    locator:
      selector: '[aria-label="Document status: Processing"]'
    timeout_ms: 180000
`;
    const parsed = parseScenario(yaml);
    const step = parsed.steps[0] as DemoStep;
    expect(step.action).toBe("wait");
    expect(step.until).toBe("hidden");
    expect(step.locator?.kind).toBe("selector");
    expect(step.timeout_ms).toBe(180000);
  });

  it("parses wait until hidden with refresh_every_ms", () => {
    const yaml = `
name: wait-refresh
base_url: http://localhost:2000/
steps:
  - action: wait
    until: hidden
    locator:
      selector: '[aria-label="Document status: Processing"]'
    timeout_ms: 180000
    refresh_every_ms: 5000
`;
    const parsed = parseScenario(yaml);
    const step = parsed.steps[0] as DemoStep;
    expect(step.refresh_every_ms).toBe(5000);
  });

  it("rejects refresh_every_ms without until hidden", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: wait
    timeout_ms: 1000
    refresh_every_ms: 5000
`;
    expect(() => parseScenario(yaml)).toThrow(
      'refresh_every_ms is only allowed on action "wait" with until "hidden"'
    );
  });

  it("parses refresh_every_ms at minimum 500", () => {
    const yaml = `
name: ok
base_url: http://localhost:2000/
steps:
  - action: wait
    until: hidden
    locator:
      selector: ".spinner"
    timeout_ms: 10000
    refresh_every_ms: 500
`;
    const parsed = parseScenario(yaml);
    expect((parsed.steps[0] as DemoStep).refresh_every_ms).toBe(500);
  });

  it("rejects refresh_every_ms below 500", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: wait
    until: hidden
    locator:
      selector: ".spinner"
    timeout_ms: 10000
    refresh_every_ms: 499
`;
    expect(() => parseScenario(yaml)).toThrow("refresh_every_ms must be an integer >= 500");
  });

  it("rejects wait until hidden without locator", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: wait
    until: hidden
    timeout_ms: 1000
`;
    expect(() => parseScenario(yaml)).toThrow('action "wait" with until "hidden" requires "locator"');
  });

  it("rejects empty caption when caption key is set", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: click
    locator: { role: button, name: Go }
    caption: "   "
`;
    expect(() => parseScenario(yaml)).toThrow(/caption must be non-empty when set/);
    expect(() => parseScenario(yaml)).toThrow(/step: action=click/);
  });

  it("parses repeat_while_visible with nested steps", () => {
    const yaml = `
name: loop
base_url: http://localhost:2000/
steps:
  - action: repeat_while_visible
    locator:
      selector: "(//button)[1]"
    max_iterations: 5
    steps:
      - action: click
        locator:
          selector: "(//button)[1]"
      - action: wait
        timeout_ms: 100
`;
    const parsed = parseScenario(yaml);
    const step = parsed.steps[0] as DemoStep;
    expect(step.action).toBe("repeat_while_visible");
    expect(step.max_iterations).toBe(5);
    expect(step.steps).toHaveLength(2);
    expect(step.steps![0]!.action).toBe("click");
  });

  it("rejects repeat_while_visible without nested steps", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: repeat_while_visible
    locator:
      selector: "(//button)[1]"
`;
    expect(() => parseScenario(yaml)).toThrow(/non-empty "steps" array/);
  });

  it("parses cut_video with placeholder and nested wait steps", () => {
    const yaml = `
name: wait-docs
base_url: http://localhost:2000/
steps:
  - action: cut_video
    placeholder:
      action: title_card
      text: "Indexing documents for search"
      hold_ms: 2000
    steps:
      - action: wait
        timeout_ms: 2000
      - action: wait
        until: hidden
        locator:
          selector: '[aria-label="Document status: Processing"]'
        timeout_ms: 180000
        refresh_every_ms: 5000
`;
    const parsed = parseScenario(yaml);
    const step = parsed.steps[0] as DemoStep;
    expect(step.action).toBe("cut_video");
    expect(step.placeholder?.action).toBe("title_card");
    expect(step.placeholder?.text).toBe("Indexing documents for search");
    expect(step.steps).toHaveLength(2);
    expect(step.steps![1]!.until).toBe("hidden");
  });

  it("rejects cut_video placeholder that is not title_card", () => {
    const yaml = `
name: bad
base_url: http://localhost:2000/
steps:
  - action: cut_video
    placeholder:
      action: wait
      timeout_ms: 1000
    steps:
      - action: wait
        timeout_ms: 500
`;
    expect(() => parseScenario(yaml)).toThrow(/placeholder must use action "title_card"/);
  });

  it("parses video_exclude on a step", () => {
    const yaml = `
name: x
base_url: http://localhost:2000/
steps:
  - action: wait
    timeout_ms: 60000
    video_exclude: true
`;
    const step = parseScenario(yaml).steps[0] as DemoStep;
    expect(step.video_exclude).toBe(true);
  });

  it("parses video.playback_speed", () => {
    const yaml = `
name: x
base_url: http://localhost:2000/
video:
  enabled: true
  dir: output
  playback_speed: 1.25
steps: []
`;
    const parsed = parseScenario(yaml);
    expect(parsed.video?.playback_speed).toBe(1.25);
  });

  it("rejects invalid video.playback_speed", () => {
    for (const bad of [0, -1, 5]) {
      const yaml = `
name: x
base_url: http://localhost:2000/
video:
  enabled: true
  dir: output
  playback_speed: ${bad}
steps: []
`;
      expect(() => parseScenario(yaml)).toThrow(/playback_speed/);
    }
    const yamlStr = `
name: x
base_url: http://localhost:2000/
video:
  enabled: true
  dir: output
  playback_speed: fast
steps: []
`;
    expect(() => parseScenario(yamlStr)).toThrow(/playback_speed/);
  });

  it("parses per-step typing_delay_ms on type", () => {
    const yaml = `
name: x
base_url: http://localhost:2000/
typing_delay_ms: 50
steps:
  - action: type
    locator: { label: Short }
    value: hi
  - action: type
    locator: { label: Long }
    typing_delay_ms: 0
    value: long prompt
`;
    const steps = parseScenario(yaml).steps as DemoStep[];
    expect(steps[0].typing_delay_ms).toBeUndefined();
    expect(steps[1].typing_delay_ms).toBe(0);
  });

  it("parses drag with offset_x and default offset_y", () => {
    const yaml = `
name: x
base_url: http://localhost:2000/
steps:
  - action: drag
    locator:
      selector: .splitpanes__splitter
    offset_x: -120
`;
    const step = parseScenario(yaml).steps[0] as DemoStep;
    expect(step.action).toBe("drag");
    expect(step.offset_x).toBe(-120);
    expect(step.offset_y).toBe(0);
  });
});
