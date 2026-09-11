import { describe, expect, it } from "vitest";
import {
  buildUrlCaptureHooks,
  createRegexUrlCapture,
  parseCaptureFromUrlArg,
} from "../src/url-capture";

describe("url-capture", () => {
  it("captures named groups from arbitrary URL patterns", () => {
    const hook = createRegexUrlCapture([
      { variable: "workspace_id", pattern: String.raw`/workspace/([^/]+)(?:/|$)` },
      { variable: "document_id", pattern: String.raw`/workspace/[^/]+/doc/([^/]+)` },
    ]);
    const captured: Record<string, string> = {};
    hook("https://app.example/sb/workspace/ws123/doc/doc456/edit", captured);
    expect(captured.workspace_id).toBe("ws123");
    expect(captured.document_id).toBe("doc456");
  });

  it("parses CLI VARIABLE=pattern args", () => {
    expect(parseCaptureFromUrlArg(String.raw`org_id=/orgs/([^/]+)`)).toEqual({
      variable: "org_id",
      pattern: String.raw`/orgs/([^/]+)`,
    });
  });

  it("builds hooks from scenario + cli rules", () => {
    const hooks = buildUrlCaptureHooks({
      scenarioRules: [{ variable: "a", pattern: String.raw`/a/([^/]+)` }],
      cliRules: [{ variable: "b", pattern: String.raw`/b/([^/]+)` }],
    });
    expect(hooks).toHaveLength(1);
    const captured: Record<string, string> = {};
    hooks![0]!("https://x/a/1/b/2", captured);
    expect(captured).toEqual({ a: "1", b: "2" });
  });

  it("returns undefined when no rules", () => {
    expect(buildUrlCaptureHooks({})).toBeUndefined();
  });
});
