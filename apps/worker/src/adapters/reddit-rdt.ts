import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { DiscoveredPostInput } from "@mentionish/types";
import {
  normalizeRedditPost,
  RedditAuthenticationError,
  RedditRateLimitError,
  type RedditResponseCache,
} from "./reddit.js";
import type { PlatformAdapter, PlatformFetchResult } from "./types.js";

export interface RdtCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RdtCommandRunner = (
  arguments_: readonly string[],
) => Promise<RdtCommandResult>;

export interface RdtCliRedditAdapterOptions {
  maxQueriesPerScan?: number;
  maxResultsPerQuery?: number;
  maxRevalidationPerRun?: number;
  rotationSeed?: () => number;
  cache?: RedditResponseCache;
  cacheTtlSeconds?: number;
}

const allowedRdtCommands = new Set(["search", "read"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertRdtReadCommand(arguments_: readonly string[]): void {
  const command = arguments_[0];
  if (!command || !allowedRdtCommands.has(command)) {
    throw new Error("The Reddit cookie transport permits read commands only.");
  }
}

function childEnvironment(credentialHome: string): NodeJS.ProcessEnv {
  const allowedNames = [
    "COMSPEC",
    "LANG",
    "LC_ALL",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "VIRTUAL_ENV",
    "WINDIR",
  ];
  return {
    ...Object.fromEntries(
      allowedNames.flatMap((name) => {
        const value = process.env[name];
        return value === undefined ? [] : [[name, value]];
      }),
    ),
    APPDATA: join(credentialHome, "AppData", "Roaming"),
    HOME: credentialHome,
    LOCALAPPDATA: join(credentialHome, "AppData", "Local"),
    USERPROFILE: credentialHome,
    XDG_CONFIG_HOME: join(credentialHome, ".config"),
  };
}

async function assertCredentialFile(credentialHome: string): Promise<void> {
  try {
    const content = await readFile(
      join(credentialHome, ".config", "rdt-cli", "credential.json"),
      "utf8",
    );
    const parsed = JSON.parse(content) as unknown;
    if (
      !isRecord(parsed) ||
      !isRecord(parsed.cookies) ||
      typeof parsed.cookies.reddit_session !== "string" ||
      parsed.cookies.reddit_session.length === 0
    ) {
      throw new Error("invalid credential shape");
    }
  } catch {
    throw new RedditAuthenticationError(
      "The isolated Reddit cookie credential is missing or invalid.",
    );
  }
}

export function createRdtCommandRunner(
  executable: string,
  credentialHome: string,
  timeoutMilliseconds = 45_000,
  maxOutputBytes = 512 * 1024,
): RdtCommandRunner {
  if (!executable.trim())
    throw new Error("The rdt-cli executable is required.");
  if (!isAbsolute(credentialHome)) {
    throw new Error("REDDIT_RDT_HOME must be an absolute path.");
  }

  return async (arguments_) => {
    assertRdtReadCommand(arguments_);
    await assertCredentialFile(credentialHome);
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...arguments_], {
        env: childEnvironment(credentialHome),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;

      const finishWithError = (error: Error) => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(error);
      };
      const timer = setTimeout(
        () => {
          finishWithError(new Error("The Reddit read command timed out."));
        },
        Math.max(1_000, timeoutMilliseconds),
      );

      const collect = (target: Buffer[], chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          finishWithError(
            new Error("The Reddit read command exceeded its output limit."),
          );
          return;
        }
        target.push(chunk);
      };
      child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        finishWithError(
          new Error(
            `Unable to start the rdt-cli read command: ${error.message}`,
          ),
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
  };
}

function selectedKeywords(
  keywords: readonly string[],
  maximum: number,
  seed: number,
): string[] {
  const unique = [...new Set(keywords)].sort();
  if (unique.length <= maximum) return unique;
  const offset = Math.abs(seed) % unique.length;
  return Array.from(
    { length: maximum },
    (_, index) => unique[(offset + index) % unique.length],
  ).filter((keyword): keyword is string => keyword !== undefined);
}

function commandText(result: RdtCommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim().slice(0, 1_000);
}

function throwCommandFailure(result: RdtCommandResult): never {
  const detail = commandText(result);
  if (
    /not_authenticated|forbidden|no reddit cookies|session expired|http 40[13]/i.test(
      detail,
    )
  ) {
    throw new RedditAuthenticationError(
      "The Reddit cookie session is missing, expired, or unauthorized.",
    );
  }
  if (/rate_limited|http 429|too many requests/i.test(detail)) {
    throw new RedditRateLimitError(
      "The Reddit cookie transport was rate limited.",
      null,
    );
  }
  throw new Error(
    `The Reddit read command failed with exit code ${result.exitCode}.`,
  );
}

function parsedJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error("The Reddit read command returned invalid JSON.");
  }
}

function resultItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (payload.ok === false) {
    const error = isRecord(payload.error) ? payload.error : {};
    const code = typeof error.code === "string" ? error.code : "api_error";
    const message = typeof error.message === "string" ? error.message : code;
    throwCommandFailure({ exitCode: 1, stdout: message, stderr: code });
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
    return payload.data.items;
  }
  return [];
}

function missingContent(result: RdtCommandResult): boolean {
  return /not_found|http 404|deleted|removed|no post/i.test(
    commandText(result),
  );
}

export class RdtCliRedditAdapter implements PlatformAdapter {
  readonly platform = "reddit" as const;
  private readonly maxQueriesPerScan: number;
  private readonly maxResultsPerQuery: number;
  private readonly maxRevalidationPerRun: number;
  private readonly rotationSeed: () => number;
  private readonly cache: RedditResponseCache | undefined;
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly runCommand: RdtCommandRunner,
    options: RdtCliRedditAdapterOptions = {},
  ) {
    this.maxQueriesPerScan = Math.max(
      1,
      Math.min(20, options.maxQueriesPerScan ?? 5),
    );
    this.maxResultsPerQuery = Math.max(
      1,
      Math.min(100, options.maxResultsPerQuery ?? 25),
    );
    this.maxRevalidationPerRun = Math.max(
      1,
      Math.min(25, options.maxRevalidationPerRun ?? 10),
    );
    this.rotationSeed =
      options.rotationSeed ??
      (() => Math.floor(Date.now() / (25 * 60 * 1_000)));
    this.cache = options.cache;
    this.cacheTtlSeconds = Math.max(
      1,
      Math.min(300, options.cacheTtlSeconds ?? 300),
    );
  }

  async fetch(keywords: readonly string[]): Promise<PlatformFetchResult> {
    const keywordsToQuery = selectedKeywords(
      keywords,
      this.maxQueriesPerScan,
      this.rotationSeed(),
    );
    const byId = new Map<string, DiscoveredPostInput>();
    let queryCount = 0;

    for (const keyword of keywordsToQuery) {
      const cacheKey =
        "mentionish:reddit:rdt-search:v1:" +
        createHash("sha256").update(keyword).digest("hex");
      const cached = this.cache ? await this.cache.get(cacheKey) : null;
      let payload = cached;
      if (cached === null) {
        const result = await this.runCommand([
          "search",
          "--sort",
          "new",
          "--time",
          "day",
          "--limit",
          String(this.maxResultsPerQuery),
          "--compact",
          "--json",
          "--",
          keyword,
        ]);
        if (result.exitCode !== 0) throwCommandFailure(result);
        payload = parsedJson(result.stdout);
        queryCount += 1;
        await this.cache?.set(cacheKey, payload, this.cacheTtlSeconds);
      }

      for (const rawPost of resultItems(payload)) {
        const post = normalizeRedditPost(rawPost);
        if (post) byId.set(post.external_id, post);
      }
    }

    return {
      posts: [...byId.values()],
      queryCount,
      deletedExternalIds: [],
    };
  }

  async revalidate(externalIds: readonly string[]): Promise<Set<string>> {
    const ids = [...new Set(externalIds)]
      .filter((id) => /^[a-z0-9]+$/i.test(id))
      .slice(0, this.maxRevalidationPerRun);
    const liveIds = new Set<string>();

    for (const id of ids) {
      const result = await this.runCommand([
        "read",
        id,
        "--limit",
        "1",
        "--compact",
        "--json",
      ]);
      if (result.exitCode === 0) {
        liveIds.add(id);
        continue;
      }
      if (missingContent(result)) continue;
      throwCommandFailure(result);
    }
    return liveIds;
  }
}
