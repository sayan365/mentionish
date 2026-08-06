import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import type { DiscoveredPostInput } from "@mentionish/types";
import {
  normalizeRedditPost,
  RedditAuthenticationError,
  RedditRateLimitError,
  type RedditResponseCache,
} from "./reddit.js";
import type { PlatformAdapter, PlatformFetchResult } from "./types.js";

export interface OpenCliCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type OpenCliCommandRunner = (
  arguments_: readonly string[],
) => Promise<OpenCliCommandResult>;

export interface OpenCliRedditAdapterOptions {
  maxQueriesPerScan?: number;
  maxResultsPerQuery?: number;
  maxRevalidationPerRun?: number;
  rotationSeed?: () => number;
  cache?: RedditResponseCache;
  cacheTtlSeconds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertOpenCliRedditReadCommand(
  arguments_: readonly string[],
): void {
  if (
    arguments_[0] !== "reddit" ||
    (arguments_[1] !== "search" && arguments_[1] !== "read")
  ) {
    throw new Error("The OpenCLI Reddit transport permits read commands only.");
  }
}

function childEnvironment(): NodeJS.ProcessEnv {
  const allowedNames = [
    "APPDATA",
    "COMSPEC",
    "HOME",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ];
  return Object.fromEntries(
    allowedNames.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

export function createOpenCliCommandRunner(
  executable: string,
  entrypoint: string,
  timeoutMilliseconds = 60_000,
  maxOutputBytes = 2 * 1024 * 1024,
): OpenCliCommandRunner {
  if (!executable.trim())
    throw new Error("The OpenCLI executable is required.");
  if (!isAbsolute(entrypoint)) {
    throw new Error("REDDIT_OPENCLI_SCRIPT must be an absolute path.");
  }

  return (arguments_) => {
    assertOpenCliRedditReadCommand(arguments_);
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [entrypoint, ...arguments_], {
        env: childEnvironment(),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new Error("The OpenCLI Reddit command timed out.")),
        Math.max(1_000, timeoutMilliseconds),
      );
      const collect = (target: Buffer[], chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          fail(
            new Error("The OpenCLI Reddit command exceeded its output limit."),
          );
          return;
        }
        target.push(chunk);
      };
      child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        fail(new Error(`Unable to start OpenCLI: ${error.message}`));
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

function commandText(result: OpenCliCommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim().slice(0, 2_000);
}

function throwCommandFailure(result: OpenCliCommandResult): never {
  const detail = commandText(result);
  if (
    /forbidden|unauthorized|not logged in|login required|extension.*disconnected|browser bridge.*disconnected|daemon.*not running|econnrefused|http 40[13]/i.test(
      detail,
    )
  ) {
    throw new RedditAuthenticationError(
      "The OpenCLI Reddit browser session is unavailable or unauthorized.",
    );
  }
  if (/rate.?limit|http 429|too many requests/i.test(detail)) {
    throw new RedditRateLimitError("OpenCLI Reddit was rate limited.", null);
  }
  throw new Error(`OpenCLI Reddit failed with exit code ${result.exitCode}.`);
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error("OpenCLI Reddit returned invalid JSON.");
  }
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

function normalizeOpenCliPost(input: unknown): DiscoveredPostInput | null {
  if (!isRecord(input)) return null;
  const url = typeof input.url === "string" ? input.url : undefined;
  const subreddit =
    typeof input.subreddit === "string"
      ? input.subreddit.replace(/^r\//i, "")
      : input.subreddit;
  return normalizeRedditPost({
    ...input,
    subreddit,
    permalink: url,
    url: isRecord(input) ? input.url_overridden_by_dest : undefined,
    num_comments: input.comments,
  });
}

function missingContent(result: OpenCliCommandResult): boolean {
  return /not.?found|deleted|removed|no post/i.test(commandText(result));
}

export class OpenCliRedditAdapter implements PlatformAdapter {
  readonly platform = "reddit" as const;
  private readonly maxQueriesPerScan: number;
  private readonly maxResultsPerQuery: number;
  private readonly maxRevalidationPerRun: number;
  private readonly rotationSeed: () => number;
  private readonly cache: RedditResponseCache | undefined;
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly runCommand: OpenCliCommandRunner,
    options: OpenCliRedditAdapterOptions = {},
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
        "mentionish:reddit:opencli-search:v1:" +
        createHash("sha256").update(keyword).digest("hex");
      const cached = this.cache ? await this.cache.get(cacheKey) : null;
      let payload = cached;
      if (cached === null) {
        const result = await this.runCommand([
          "reddit",
          "search",
          keyword,
          "--sort",
          "new",
          "--time",
          "day",
          "--limit",
          String(this.maxResultsPerQuery),
          "--format",
          "json",
        ]);
        if (result.exitCode !== 0) throwCommandFailure(result);
        payload = parseJson(result.stdout);
        queryCount += 1;
        await this.cache?.set(cacheKey, payload, this.cacheTtlSeconds);
      }
      if (!Array.isArray(payload)) continue;
      for (const rawPost of payload) {
        const post = normalizeOpenCliPost(rawPost);
        if (post) byId.set(post.external_id, post);
      }
    }

    return { posts: [...byId.values()], queryCount, deletedExternalIds: [] };
  }

  async revalidate(externalIds: readonly string[]): Promise<Set<string>> {
    const ids = [...new Set(externalIds)]
      .filter((id) => /^[a-z0-9]+$/i.test(id))
      .slice(0, this.maxRevalidationPerRun);
    const liveIds = new Set<string>();
    for (const id of ids) {
      const result = await this.runCommand([
        "reddit",
        "read",
        id,
        "--limit",
        "1",
        "--depth",
        "1",
        "--replies",
        "1",
        "--max-length",
        "100",
        "--format",
        "json",
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
