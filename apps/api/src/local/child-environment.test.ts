import { describe, expect, it } from "vitest";
import { sanitizedChildEnvironment } from "./child-environment.js";

describe("sanitized child environment", () => {
  it("keeps operating-system paths without forwarding credentials or injection options", () => {
    const environment = sanitizedChildEnvironment({
      APPDATA: "C:\\Users\\founder\\AppData\\Roaming",
      PATH: "C:\\Windows\\System32",
      HOME: "/home/founder",
      OPENAI_API_KEY: "must-not-leave-parent",
      REDDIT_SESSION: "must-not-leave-parent",
      NODE_OPTIONS: "--require malicious-hook.js",
    });

    expect(environment).toEqual({
      APPDATA: "C:\\Users\\founder\\AppData\\Roaming",
      HOME: "/home/founder",
      PATH: "C:\\Windows\\System32",
    });
  });
});
