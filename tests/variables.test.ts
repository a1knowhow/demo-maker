import { describe, it, expect } from "vitest";
import { resolveVariables } from "../src/variables";
import { resolveLocatorVariables } from "../src/runner";
import type { Locator, RunContext } from "../src/types";

function ctx(variables?: Record<string, string>): RunContext {
  return {
    auth: { email: "u@example.com", password: "secret" },
    ...(variables !== undefined && { variables }),
  };
}

describe("demo-maker variables", () => {
  describe("resolveVariables", () => {
    it("resolves auth.email and auth.password", () => {
      const context = ctx();
      expect(resolveVariables("{{ auth.email }}", context)).toBe("u@example.com");
      expect(resolveVariables("{{ auth.password }}", context)).toBe("secret");
    });

    it("resolves flat variable from context.variables", () => {
      const context = ctx({ workspace_id: "ws123", DEMO_PDF1: "OLED65CX6LA_PIS.pdf" });
      expect(resolveVariables("{{ workspace_id }}", context)).toBe("ws123");
      expect(resolveVariables("{{ DEMO_PDF1 }}", context)).toBe("OLED65CX6LA_PIS.pdf");
    });

    it("trims whitespace inside placeholder", () => {
      const context = ctx({ DEMO_PDF1: "file.pdf" });
      expect(resolveVariables("{{  DEMO_PDF1  }}", context)).toBe("file.pdf");
      expect(resolveVariables("{{ DEMO_PDF1 }}", context)).toBe("file.pdf");
    });

    it("resolves multiple placeholders in one string", () => {
      const context = ctx({ workspace_id: "ws1", document_id: "doc1" });
      expect(
        resolveVariables("/sb/workspace/{{ workspace_id }}/doc/{{ document_id }}", context)
      ).toBe("/sb/workspace/ws1/doc/doc1");
    });

    it("leaves unresolved placeholder as-is", () => {
      const context = ctx({});
      expect(resolveVariables("{{ MISSING_VAR }}", context)).toBe("{{ MISSING_VAR }}");
    });

    it("leaves unresolved when variables is undefined", () => {
      const context = ctx();
      expect(resolveVariables("{{ workspace_id }}", context)).toBe("{{ workspace_id }}");
    });

    it("returns empty string for empty template", () => {
      expect(resolveVariables("", ctx())).toBe("");
    });

    it("handles no placeholders", () => {
      expect(resolveVariables("/static/path", ctx())).toBe("/static/path");
    });
  });

  describe("resolveLocatorVariables", () => {
    it("interpolates role name", () => {
      const locator: Locator = { kind: "role", role: "button", name: "{{ DEMO_PDF1 }}" };
      const context = ctx({ DEMO_PDF1: "OLED65CX6LA_PIS.pdf" });
      const resolved = resolveLocatorVariables(locator, context);
      expect(resolved.kind).toBe("role");
      expect(resolved).toMatchObject({ kind: "role", role: "button", name: "OLED65CX6LA_PIS.pdf" });
    });

    it("leaves role RegExp name unchanged", () => {
      const re = /Sign in/i;
      const locator: Locator = { kind: "role", role: "button", name: re };
      const resolved = resolveLocatorVariables(locator, ctx({ X: "y" }));
      expect(resolved.kind).toBe("role");
      expect((resolved as { name: RegExp }).name).toBe(re);
    });

    it("interpolates label", () => {
      const locator: Locator = { kind: "label", label: "File {{ workspace_id }}" };
      const context = ctx({ workspace_id: "ws99" });
      const resolved = resolveLocatorVariables(locator, context);
      expect(resolved).toMatchObject({ kind: "label", label: "File ws99" });
    });

    it("interpolates text", () => {
      const locator: Locator = { kind: "text", text: "{{ DEMO_PDF1 }}" };
      const context = ctx({ DEMO_PDF1: "my-doc.pdf" });
      const resolved = resolveLocatorVariables(locator, context);
      expect(resolved).toMatchObject({ kind: "text", text: "my-doc.pdf" });
    });

    it("interpolates placeholder and title", () => {
      const context = ctx({ doc_id: "d1" });
      expect(
        resolveLocatorVariables(
          { kind: "placeholder", placeholder: "{{ doc_id }}" },
          context
        )
      ).toMatchObject({ kind: "placeholder", placeholder: "d1" });
      expect(
        resolveLocatorVariables({ kind: "title", title: "{{ doc_id }}" }, context)
      ).toMatchObject({ kind: "title", title: "d1" });
    });

    it("interpolates selector", () => {
      const locator: Locator = { kind: "selector", selector: "input[type=\"file\"]" };
      const resolved = resolveLocatorVariables(locator, ctx({}));
      expect(resolved).toMatchObject({ kind: "selector", selector: "input[type=\"file\"]" });
      const withVar: Locator = { kind: "selector", selector: "input[data-id=\"{{ doc_id }}\"]" };
      expect(resolveLocatorVariables(withVar, ctx({ doc_id: "d1" }))).toMatchObject({
        kind: "selector",
        selector: "input[data-id=\"d1\"]",
      });
    });

    it("leaves unresolved placeholder in locator as-is", () => {
      const locator: Locator = { kind: "role", role: "button", name: "{{ UNKNOWN }}" };
      const resolved = resolveLocatorVariables(locator, ctx({}));
      expect(resolved).toMatchObject({ kind: "role", role: "button", name: "{{ UNKNOWN }}" });
    });
  });
});
