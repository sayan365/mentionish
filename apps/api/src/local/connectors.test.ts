import { describe, expect, it, vi } from "vitest";
import {
  probeLocalConnectors,
  type CommandRunner,
  type CommandResult,
} from "./connectors.js";

function runnerFor(
  installed: readonly string[],
  timedOut: readonly string[] = [],
): CommandRunner {
  return vi.fn((executable: string): Promise<CommandResult> => {
    if (timedOut.includes(executable)) {
      return Promise.resolve({ exitCode: null, timedOut: true });
    }
    return Promise.resolve({
      exitCode: installed.includes(executable) ? 0 : null,
      timedOut: false,
    });
  });
}

describe("local connector diagnostics", () => {
  it("keeps Hacker News ready when optional tools are absent", async () => {
    const result = await probeLocalConnectors(runnerFor([]));
    expect(result).toMatchObject([
      { id: "agent-reach", state: "unavailable" },
      { id: "hackernews", state: "ready", backend: "public-api" },
      { id: "reddit", state: "unavailable" },
      { id: "twitter", state: "unavailable" },
    ]);
  });

  it("selects the preferred installed local backends", async () => {
    const result = await probeLocalConnectors(
      runnerFor(["agent-reach", "opencli", process.execPath, "rdt", "twitter"]),
    );
    expect(result).toMatchObject([
      { id: "agent-reach", state: "ready" },
      { id: "hackernews", state: "ready" },
      { id: "reddit", state: "setup_needed", backend: "OpenCLI" },
      { id: "twitter", state: "setup_needed", backend: "twitter-cli" },
    ]);
  });

  it("does not report a timed-out executable as ready", async () => {
    const result = await probeLocalConnectors(
      runnerFor(["rdt"], ["agent-reach"]),
    );
    expect(result[0]).toMatchObject({ state: "unavailable" });
    expect(result[2]).toMatchObject({
      state: "setup_needed",
      backend: "rdt-cli",
    });
  });
});
