import { describe, expect, it } from "vitest";
import { resolveLocalDataPaths } from "./paths.js";

describe("resolveLocalDataPaths", () => {
  it("uses LocalAppData on Windows", () => {
    const paths = resolveLocalDataPaths({
      platform: "win32",
      homeDirectory: "C:\\Users\\Founder",
      environment: { LOCALAPPDATA: "C:\\Users\\Founder\\AppData\\Local" },
    });

    expect(paths).toEqual({
      dataDirectory: "C:\\Users\\Founder\\AppData\\Local\\Mentionish",
      databasePath:
        "C:\\Users\\Founder\\AppData\\Local\\Mentionish\\mentionish.sqlite3",
      backupsDirectory:
        "C:\\Users\\Founder\\AppData\\Local\\Mentionish\\backups",
    });
  });

  it("uses Application Support on macOS", () => {
    const paths = resolveLocalDataPaths({
      platform: "darwin",
      homeDirectory: "/Users/founder",
      environment: {},
    });

    expect(paths.dataDirectory).toBe(
      "/Users/founder/Library/Application Support/Mentionish",
    );
  });

  it("honors XDG_DATA_HOME on Linux", () => {
    const paths = resolveLocalDataPaths({
      platform: "linux",
      homeDirectory: "/home/founder",
      environment: { XDG_DATA_HOME: "/data/founder" },
    });

    expect(paths.dataDirectory).toBe("/data/founder/mentionish");
    expect(paths.databasePath).toBe(
      "/data/founder/mentionish/mentionish.sqlite3",
    );
  });

  it("allows an explicit data-directory override", () => {
    const paths = resolveLocalDataPaths({
      platform: "linux",
      homeDirectory: "/home/founder",
      environment: { MENTIONISH_DATA_DIR: "/portable/mentionish" },
    });

    expect(paths.dataDirectory).toBe("/portable/mentionish");
  });
});
