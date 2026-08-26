/* global URL, fetch, setTimeout, console */
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const root = new URL("../", import.meta.url);
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    "Run Mentionish with npm so the npm executable can be resolved.",
  );
}

const children = new Set();
let stopping = false;

function runNpm(arguments_, options = {}) {
  const child = spawn(process.execPath, [npmCli, ...arguments_], {
    cwd: root,
    env: { ...process.env, ...options.environment },
    stdio: options.stdio ?? "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function runNpmAndWait(arguments_) {
  return new Promise((resolve, reject) => {
    const child = runNpm(arguments_);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`npm ${arguments_.join(" ")} failed (${signal ?? code}).`),
        );
    });
  });
}

async function waitFor(url, label, timeoutMilliseconds = 60_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Startup polling is bounded by the deadline below.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not become ready within 60 seconds.`);
}

function openBrowser(url) {
  if (process.argv.includes("--no-open")) return;
  const command =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const opener = spawn(command[0], command[1], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  opener.unref();
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exitCode = exitCode;
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

try {
  console.log("Preparing Mentionish local dependencies...");
  await runNpmAndWait(["run", "build", "--workspace", "@mentionish/types"]);
  await runNpmAndWait(["run", "build", "--workspace", "@mentionish/database"]);
  await runNpmAndWait(["run", "build", "--workspace", "@mentionish/ai"]);

  const apiPort = process.env.API_PORT ?? "4000";
  const dashboardPort = process.env.DASHBOARD_PORT ?? "3000";
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${apiPort}`;
  const sharedEnvironment = {
    API_HOST: "127.0.0.1",
    API_PORT: apiPort,
    DASHBOARD_ORIGIN: process.env.DASHBOARD_ORIGIN ?? dashboardUrl,
    NEXT_PUBLIC_API_URL: apiUrl,
  };

  const api = runNpm(["run", "dev", "--workspace", "@mentionish/api"], {
    environment: sharedEnvironment,
  });
  const dashboard = runNpm(
    [
      "run",
      "dev",
      "--workspace",
      "@mentionish/dashboard",
      "--",
      "--port",
      dashboardPort,
    ],
    { environment: sharedEnvironment },
  );
  api.once("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
  dashboard.once("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });

  await Promise.all([
    waitFor(`http://127.0.0.1:${apiPort}/health`, "Local API"),
    waitFor(dashboardUrl, "Dashboard"),
  ]);
  console.log(`Mentionish is ready at ${dashboardUrl}`);
  openBrowser(dashboardUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
