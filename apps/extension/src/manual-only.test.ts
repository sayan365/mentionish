import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

describe("manual-only posting boundary", () => {
  it("has no Reddit API or background privileges", () => {
    expect(manifest.permissions).toEqual([]);
    expect(manifest).not.toHaveProperty("background");
    expect(manifest).not.toHaveProperty("host_permissions");
  });

  it("contains no network or submit operation", async () => {
    const sources = await Promise.all([
      readFile(new URL("./content.ts", import.meta.url), "utf8"),
      readFile(new URL("./reddit-editor.ts", import.meta.url), "utf8"),
    ]);
    const combined = sources.join("\n");

    expect(combined).not.toMatch(/oauth\.reddit|\/api\/submit|requestSubmit/);
    expect(combined).not.toMatch(/\.submit\s*\(|fetch\s*\(/);
  });
});
