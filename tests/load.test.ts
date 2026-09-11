import { describe, it, expect } from "vitest";
import { loadScenario } from "../src/load";

/** Virtual file system: absolute path -> YAML content. */
function createFs(files: Record<string, string>) {
  return (absolutePath: string): string => {
    const content = files[absolutePath];
    if (content === undefined) {
      throw new Error(`ENOENT: no such file ${absolutePath}`);
    }
    return content;
  };
}

describe("demo-maker load", () => {
  it("preserves title from entry scenario", () => {
    const yaml = `
name: solo
title: YouTube title here
base_url: http://localhost:3000/
steps: []
`;
    const fs = createFs({ "/fixture/main.yaml": yaml });
    const scenario = loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs });
    expect(scenario.title).toBe("YouTube title here");
  });

  it("loads scenario with no imports (same as parse + flatten)", () => {
    const yaml = `
name: solo
base_url: http://localhost:3000/
steps:
  - action: navigate
    url: /
  - action: click
    locator:
      role: button
      name: OK
`;
    const fs = createFs({ "/fixture/main.yaml": yaml });
    const scenario = loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs });
    expect(scenario.name).toBe("solo");
    expect(scenario.base_url).toBe("http://localhost:3000/");
    expect(scenario.steps).toHaveLength(2);
    expect(scenario.steps[0].action).toBe("navigate");
    expect(scenario.steps[1].action).toBe("click");
  });

  it("expands top-level imports then local steps", () => {
    const main = `
name: main
base_url: http://localhost:2000/
imports:
  - a.yaml
  - b.yaml
steps:
  - action: click
    locator:
      role: link
      name: end
`;
    const aYaml = `
name: a
base_url: http://ignore/
steps:
  - action: navigate
    url: /a
`;
    const bYaml = `
name: b
base_url: http://ignore/
steps:
  - action: navigate
    url: /b
`;
    const fs = createFs({
      "/fixture/main.yaml": main,
      "/fixture/a.yaml": aYaml,
      "/fixture/b.yaml": bYaml,
    });
    const scenario = loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs });
    expect(scenario.name).toBe("main");
    expect(scenario.steps).toHaveLength(3);
    expect(scenario.steps[0].action).toBe("navigate");
    expect(scenario.steps[0].url).toBe("/a");
    expect(scenario.steps[1].action).toBe("navigate");
    expect(scenario.steps[1].url).toBe("/b");
    expect(scenario.steps[2].action).toBe("click");
    expect((scenario.steps[2].locator as { kind: string; name: string }).name).toBe("end");
  });

  it("expands step-level import in place (interleaving)", () => {
    const main = `
name: interleaved
base_url: http://localhost:2000/
steps:
  - import: a.yaml
  - action: click
    locator:
      role: link
      name: middle
  - import: b.yaml
`;
    const aYaml = `
name: a
base_url: http://ignore/
steps:
  - action: navigate
    url: /a
`;
    const bYaml = `
name: b
base_url: http://ignore/
steps:
  - action: navigate
    url: /b
`;
    const fs = createFs({
      "/fixture/main.yaml": main,
      "/fixture/a.yaml": aYaml,
      "/fixture/b.yaml": bYaml,
    });
    const scenario = loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs });
    expect(scenario.steps).toHaveLength(3);
    expect(scenario.steps[0].action).toBe("navigate");
    expect(scenario.steps[0].url).toBe("/a");
    expect(scenario.steps[1].action).toBe("click");
    expect((scenario.steps[1].locator as { kind: string; name: string }).name).toBe("middle");
    expect(scenario.steps[2].action).toBe("navigate");
    expect(scenario.steps[2].url).toBe("/b");
  });

  it("nested imports: main -> b -> c, order c then b then main", () => {
    const main = `
name: main
base_url: http://localhost:2000/
imports:
  - b.yaml
steps:
  - action: click
    locator:
      role: button
      name: main
`;
    const bYaml = `
name: b
base_url: http://ignore/
imports:
  - c.yaml
steps:
  - action: navigate
    url: /b
`;
    const cYaml = `
name: c
base_url: http://ignore/
steps:
  - action: navigate
    url: /c
`;
    const fs = createFs({
      "/fixture/main.yaml": main,
      "/fixture/b.yaml": bYaml,
      "/fixture/c.yaml": cYaml,
    });
    const scenario = loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs });
    expect(scenario.steps).toHaveLength(3);
    expect(scenario.steps[0].url).toBe("/c");
    expect(scenario.steps[1].url).toBe("/b");
    expect(scenario.steps[2].action).toBe("click");
    expect((scenario.steps[2].locator as { kind: string; name: string }).name).toBe("main");
  });

  it("throws on circular import", () => {
    const aYaml = `
name: a
base_url: http://ignore/
imports:
  - b.yaml
steps: []
`;
    const bYaml = `
name: b
base_url: http://ignore/
imports:
  - a.yaml
steps: []
`;
    const fs = createFs({
      "/fixture/a.yaml": aYaml,
      "/fixture/b.yaml": bYaml,
    });
    expect(() => loadScenario("/fixture/a.yaml", { cwd: "/", readFile: fs })).toThrow(/Circular import/);
  });

  it("resolves imports relative to the file that contains them", () => {
    const main = `
name: main
base_url: http://localhost:2000/
steps:
  - import: sub/fragment.yaml
  - action: navigate
    url: /
`;
    const fragment = `
name: fragment
base_url: http://ignore/
steps:
  - action: click
    locator:
      role: button
      name: frag
`;
    const fs = createFs({
      "/fixture/main.yaml": main,
      "/fixture/sub/fragment.yaml": fragment,
    });
    const scenario = loadScenario("/fixture/main.yaml", { cwd: "/", readFile: fs });
    expect(scenario.steps).toHaveLength(2);
    const [step0, step1] = scenario.steps;
    expect(step0!.action).toBe("click");
    expect((step0!.locator as { kind: string; name: string }).name).toBe("frag");
    expect(step1!.url).toBe("/");
  });
});
