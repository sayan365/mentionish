import { describe, expect, it } from "vitest";
import {
  classifyIntentJobId,
  platformFetchJobId,
  platformFetchJobSchema,
  scheduleBucket,
} from "./index.js";

describe("scheduled discovery jobs", () => {
  it("floors scheduled times into deterministic UTC buckets", () => {
    const bucket = scheduleBucket(new Date("2026-08-03T10:29:59.999Z"), 15);
    expect(bucket).toBe("2026-08-03T10:15:00.000Z");
    expect(platformFetchJobId("hackernews", bucket)).toBe(
      "scan-hackernews-1785752100000",
    );
  });

  it("validates bounded platform-fetch payloads", () => {
    expect(
      platformFetchJobSchema.parse({
        platform: "reddit",
        interval_minutes: 25,
      }),
    ).toEqual({ platform: "reddit", interval_minutes: 25 });
    expect(() =>
      platformFetchJobSchema.parse({
        platform: "reddit",
        interval_minutes: 0,
      }),
    ).toThrow();
  });
  it("creates stable classification job IDs per prompt version", () => {
    const opportunityId = "00000000-0000-4000-8000-000000000001";
    expect(classifyIntentJobId(opportunityId, "intent-v1")).toBe(
      classifyIntentJobId(opportunityId, "intent-v1"),
    );
    expect(classifyIntentJobId(opportunityId, "intent-v2")).not.toBe(
      classifyIntentJobId(opportunityId, "intent-v1"),
    );
  });
});
