import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  localConnectorDiagnosticSchema,
  type LocalConnectorDiagnostic,
} from "@mentionish/types";
import { sanitizedChildEnvironment } from "./child-environment.js";

const commandTimeoutMs = 5_000;
const maxOutputBytes = 64 * 1024;

export interface CommandResult {
  exitCode: number | null;
  timedOut: boolean;
}

export type CommandRunner = (
  executable: string,
  args: readonly string[],
) => Promise<CommandResult>;

export function runBoundedCommand(
  executable: string,
  args: readonly string[],
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      env: sanitizedChildEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    let outputBytes = 0;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const countOutput = (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        finish({ exitCode: null, timedOut: false });
      }
    };
    child.stdout?.on("data", countOutput);
    child.stderr?.on("data", countOutput);
    child.once("error", () => finish({ exitCode: null, timedOut: false }));
    child.once("close", (exitCode) => finish({ exitCode, timedOut: false }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ exitCode: null, timedOut: true });
    }, commandTimeoutMs);
    timer.unref();
  });
}

async function installed(
  runner: CommandRunner,
  executable: string,
  prefix: readonly string[] = [],
): Promise<boolean> {
  const result = await runner(executable, [...prefix, "--version"]);
  return result.exitCode === 0 && !result.timedOut;
}

function diagnostic(value: LocalConnectorDiagnostic): LocalConnectorDiagnostic {
  return localConnectorDiagnosticSchema.parse(value);
}

export async function probeLocalConnectors(
  runner: CommandRunner = runBoundedCommand,
): Promise<LocalConnectorDiagnostic[]> {
  const [agentReach, opencli, rdt, twitter] = await Promise.all([
    installed(runner, "agent-reach"),
    process.platform === "win32" && process.env.APPDATA
      ? installed(runner, process.execPath, [
          join(
            process.env.APPDATA,
            "npm",
            "node_modules",
            "@jackwener",
            "opencli",
            "dist",
            "src",
            "main.js",
          ),
        ])
      : installed(runner, "opencli"),
    installed(runner, "rdt"),
    installed(runner, "twitter"),
  ]);

  const redditBackend = opencli ? "OpenCLI" : rdt ? "rdt-cli" : null;
  const twitterBackend = twitter ? "twitter-cli" : opencli ? "OpenCLI" : null;

  return [
    diagnostic({
      id: "agent-reach",
      state: agentReach ? "ready" : "unavailable",
      backend: agentReach ? "agent-reach" : null,
      message: agentReach
        ? "Agent Reach is installed for local setup and diagnostics."
        : "Install Agent Reach to configure optional platform tools.",
    }),
    diagnostic({
      id: "hackernews",
      state: "ready",
      backend: "public-api",
      message: "Hacker News needs no local credentials.",
    }),
    diagnostic({
      id: "reddit",
      state: redditBackend ? "setup_needed" : "unavailable",
      backend: redditBackend,
      message: redditBackend
        ? redditBackend +
          " is installed. Run a user-approved live read test to verify the login session."
        : "Install OpenCLI or rdt-cli through Agent Reach, then connect a dedicated Reddit account.",
    }),
    diagnostic({
      id: "twitter",
      state: twitterBackend ? "setup_needed" : "unavailable",
      backend: twitterBackend,
      message: twitterBackend
        ? twitterBackend +
          " is installed. Run a user-approved live read test to verify the login session."
        : "Install twitter-cli or OpenCLI through Agent Reach, then connect a dedicated X account.",
    }),
  ];
}
