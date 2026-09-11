import { describe, it, expect } from "vitest";
import {
  applyBaseUrlOverride,
  resolveBaseUrlFromEnv,
} from "../src/env";

describe("demo-maker env base URL", () => {
  describe("resolveBaseUrlFromEnv", () => {
    it("returns trimmed BASE_URL from env file", () => {
      expect(
        resolveBaseUrlFromEnv({ BASE_URL: "  https://a1knowhow.com/  " }, {})
      ).toBe("https://a1knowhow.com/");
    });

    it("prefers env file over process.env", () => {
      expect(
        resolveBaseUrlFromEnv(
          { BASE_URL: "https://from-file/" },
          { BASE_URL: "https://from-shell/" }
        )
      ).toBe("https://from-file/");
    });

    it("falls back to process.env when env file has no BASE_URL", () => {
      expect(
        resolveBaseUrlFromEnv({}, { BASE_URL: "https://from-shell/" })
      ).toBe("https://from-shell/");
    });

    it("returns undefined when BASE_URL is unset or blank", () => {
      expect(resolveBaseUrlFromEnv({}, {})).toBeUndefined();
      expect(resolveBaseUrlFromEnv({ BASE_URL: "   " }, {})).toBeUndefined();
    });
  });

  describe("applyBaseUrlOverride", () => {
    it("overrides YAML base_url from env file", () => {
      const scenario = { base_url: "http://localhost:2000/" };
      applyBaseUrlOverride(scenario, {
        envFromFile: { BASE_URL: "https://a1knowhow.com/" },
      });
      expect(scenario.base_url).toBe("https://a1knowhow.com/");
    });

    it("leaves YAML base_url when env file has no BASE_URL", () => {
      const scenario = { base_url: "http://localhost:2000/" };
      const saved = process.env.BASE_URL;
      delete process.env.BASE_URL;
      try {
        applyBaseUrlOverride(scenario, { envFromFile: {} });
        expect(scenario.base_url).toBe("http://localhost:2000/");
      } finally {
        if (saved !== undefined) {
          process.env.BASE_URL = saved;
        } else {
          delete process.env.BASE_URL;
        }
      }
    });

    it("CLI --base-url beats env file BASE_URL", () => {
      const scenario = { base_url: "http://localhost:2000/" };
      applyBaseUrlOverride(scenario, {
        envFromFile: { BASE_URL: "https://a1knowhow.com/" },
        cliBaseUrl: "http://localhost:8383/",
      });
      expect(scenario.base_url).toBe("http://localhost:8383/");
    });
  });
});
