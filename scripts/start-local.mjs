/* global URL, fetch, setTimeout, console */
import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
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
const smokeMode = process.argv.includes("--smoke");
const smokeDataDirectory = smokeMode
  ? mkdtempSync(resolve(tmpdir(), "mentionish-smoke-"))
  : null;

if (smokeDataDirectory) {
  process.once("exit", () => {
    rmSync(smokeDataDirectory, { recursive: true, force: true });
  });
}

function runNpm(arguments_, options = {}) {
  const child = spawn(process.execPath, [npmCli, ...arguments_], {
    cwd: root,
    env: { ...process.env, ...options.environment },
    stdio: options.stdio ?? "inherit",
    detached: process.platform !== "win32",
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

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a loopback port."));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(String(port));
      });
    });
  });
}

function assertInsideDirectory(candidate, directory) {
  const pathFromDirectory = relative(resolve(directory), resolve(candidate));
  if (
    pathFromDirectory === "" ||
    (!pathFromDirectory.startsWith("..") && !isAbsolute(pathFromDirectory))
  ) {
    return;
  }
  throw new Error("Smoke startup escaped its temporary data directory.");
}

async function runSmokeChecks({ apiUrl, dashboardUrl, dataDirectory }) {
  const dashboardResponse = await fetch(`${dashboardUrl}/dashboard`, {
    cache: "no-store",
  });
  if (!dashboardResponse.ok) {
    throw new Error(
      `Dashboard smoke request failed with HTTP ${dashboardResponse.status}.`,
    );
  }

  const bootstrapResponse = await fetch(`${apiUrl}/api/local/bootstrap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: dashboardUrl,
    },
    body: "{}",
    cache: "no-store",
  });
  const bootstrap = await bootstrapResponse.json();
  const token = bootstrap?.data?.token;
  if (!bootstrapResponse.ok || typeof token !== "string" || token.length < 32) {
    throw new Error("Local authenticated bootstrap smoke check failed.");
  }

  const authorization = { authorization: `Bearer ${token}` };
  const dataResponse = await fetch(`${apiUrl}/api/local/data/`, {
    headers: authorization,
    cache: "no-store",
  });
  const localData = await dataResponse.json();
  if (
    !dataResponse.ok ||
    typeof localData?.data?.database_path !== "string" ||
    !Number.isInteger(localData?.data?.schema_version)
  ) {
    throw new Error("Local database status smoke check failed.");
  }
  assertInsideDirectory(localData.data.database_path, dataDirectory);

  const backupResponse = await fetch(`${apiUrl}/api/local/data/backups`, {
    method: "POST",
    headers: authorization,
    cache: "no-store",
  });
  const backup = Buffer.from(await backupResponse.arrayBuffer());
  const sqliteSignature = Buffer.from("SQLite format 3\0", "utf8");
  if (
    !backupResponse.ok ||
    backup.length <= sqliteSignature.length ||
    !backup.subarray(0, sqliteSignature.length).equals(sqliteSignature)
  ) {
    throw new Error("Integrity-checked backup smoke check failed.");
  }

  const databaseBytes = readFileSync(localData.data.database_path);
  if (
    !databaseBytes.subarray(0, sqliteSignature.length).equals(sqliteSignature)
  ) {
    throw new Error("The clean-start database is not a valid SQLite file.");
  }
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
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
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

  const [smokeApiPort, smokeDashboardPort] = smokeMode
    ? await Promise.all([reservePort(), reservePort()])
    : [null, null];
  const apiPort = smokeApiPort ?? process.env.API_PORT ?? "4000";
  const dashboardPort =
    smokeDashboardPort ?? process.env.DASHBOARD_PORT ?? "3000";
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const apiUrl = smokeMode
    ? `http://127.0.0.1:${apiPort}`
    : (process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${apiPort}`);
  const sharedEnvironment = {
    API_HOST: "127.0.0.1",
    API_PORT: apiPort,
    DASHBOARD_ORIGIN: smokeMode
      ? dashboardUrl
      : (process.env.DASHBOARD_ORIGIN ?? dashboardUrl),
    NEXT_PUBLIC_API_URL: apiUrl,
    ...(smokeDataDirectory
      ? {
          MENTIONISH_DATA_DIR: smokeDataDirectory,
          REDDIT_DISCOVERY_ENABLED: "false",
          REDDIT_POLICY_RISK_ACCEPTED: "false",
        }
      : {}),
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
  if (smokeDataDirectory) {
    await runSmokeChecks({
      apiUrl,
      dashboardUrl,
      dataDirectory: smokeDataDirectory,
    });
    console.log(
      "Clean startup smoke passed: dashboard, local auth, SQLite, and backup are ready.",
    );
    stop(0);
  } else {
    openBrowser(dashboardUrl);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
