import { describe, expect, it } from "vitest";
import { httpUrlSchema } from "./index";

describe("httpUrlSchema", () => {
  it("accepts web URLs and rejects executable or local-file schemes", () => {
    expect(httpUrlSchema.parse("https://www.reddit.com/r/saas")).toBe(
      "https://www.reddit.com/r/saas",
    );
    expect(httpUrlSchema.parse("http://127.0.0.1:11434/v1")).toBe(
      "http://127.0.0.1:11434/v1",
    );
    expect(() => httpUrlSchema.parse("javascript:alert(1)")).toThrow();
    expect(() => httpUrlSchema.parse("file:///etc/passwd")).toThrow();
  });
});
