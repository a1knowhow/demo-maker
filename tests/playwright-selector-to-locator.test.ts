import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseCodeToLocator,
  playwrightActionToDemoStep,
  playwrightSelectorToLocator,
} from "../src/playwright-selector-to-locator";

describe("demo-maker playwright-selector-to-locator", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("parses getByRole with name even with extra options", () => {
    const loc = parseCodeToLocator(
      "await page.getByRole('button', { exact: true, name: 'Accept' }).click();"
    );
    expect(loc).toEqual({ kind: "role", role: "button", name: "Accept" });
  });

  it("parses getByRole regex name", () => {
    const loc = parseCodeToLocator("await page.getByRole('button', { name: /Sign in/i }).click();");
    expect(loc?.kind).toBe("role");
    expect((loc as any).role).toBe("button");
    expect((loc as any).name).toBeInstanceOf(RegExp);
    expect(String((loc as any).name)).toBe(String(/Sign in/i));
  });

  it("returns role fallback when getByRole has no name and warns once", () => {
    const step = playwrightActionToDemoStep(
      { name: "click", selector: "internal:role=button" },
      "await page.getByRole('button').click();"
    );
    expect(step?.action).toBe("click");
    expect(step?.locator).toEqual({ kind: "role", role: "button", name: "(recorded)" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("prefers internal:text chunk over unnamed internal:role", () => {
    const loc = playwrightSelectorToLocator(
      'internal:role=button >> internal:text="Save" >> nth=0'
    );
    expect(loc).toEqual({ kind: "text", text: "Save" });
  });

  it("extracts placeholder from internal:attr", () => {
    const loc = playwrightSelectorToLocator('internal:attr=[placeholder="Email"]');
    expect(loc).toEqual({ kind: "placeholder", placeholder: "Email" });
  });

  it("extracts label from internal:attr aria-label", () => {
    const loc = playwrightSelectorToLocator('internal:attr=[aria-label="Search"]');
    expect(loc).toEqual({ kind: "label", label: "Search" });
  });

  it("prefers aria-label in selector over getByRole in code", () => {
    const step = playwrightActionToDemoStep(
      {
        name: "click",
        selector: 'internal:role=link >> internal:attr=[aria-label="Settings"]',
      },
      "await page.getByRole('link', { name: 'Settings' }).click();",
    );
    expect(step?.locator).toEqual({ kind: "label", label: "Settings" });
  });

  it("prefers getByLabel in code over getByRole", () => {
    const loc = parseCodeToLocator(
      "await page.getByLabel('Agent Name').fill('x');",
    );
    expect(loc).toEqual({ kind: "label", label: "Agent Name" });
  });

  it("extracts title from internal:attr", () => {
    const loc = playwrightSelectorToLocator('internal:attr=[title="Close"]');
    expect(loc).toEqual({ kind: "title", title: "Close" });
  });
});

