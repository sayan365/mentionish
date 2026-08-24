import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { LocalScannedItem } from "@mentionish/database";

interface OpenCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
interface SearchItem {
  id?: unknown;
  title?: unknown;
  subreddit?: unknown;
  author?: unknown;
  score?: unknown;
  comments?: unknown;
  url?: unknown;
  created_utc?: unknown;
  selftext?: unknown;
}
interface ThreadItem {
  author?: unknown;
  score?: unknown;
  text?: unknown;
  type?: unknown;
}
export class RedditAuthenticationError extends Error {
  readonly safetySignal = "authentication_failure" as const;
}
export class RedditRateLimitError extends Error {
  readonly safetySignal: "rate_limit" | "challenge" | "captcha";
  readonly retryAfterSeconds: number | null;
  constructor(
    message: string,
    safetySignal: "rate_limit" | "challenge" | "captcha" = "rate_limit",
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.safetySignal = safetySignal;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export class RedditRestrictionError extends Error {
  readonly safetySignal: "restriction" | "access_denial";
  constructor(
    message: string,
    safetySignal: "restriction" | "access_denial" = "restriction",
  ) {
    super(message);
    this.safetySignal = safetySignal;
  }
}
function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function parseArray(stdout: string): unknown[] {
  try {
    const value = JSON.parse(stdout) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    throw new Error("OpenCLI Reddit returned invalid JSON.");
  }
}
function failure(result: OpenCliResult): never {
  const detail = `${result.stdout}\n${result.stderr}`.slice(0, 2000);
  const retryAfterMatch = detail.match(/retry[- ]after\D{0,12}(\d{1,6})/i);
  const retryAfterSeconds = retryAfterMatch
    ? Number.parseInt(retryAfterMatch[1]!, 10)
    : null;
  if (/captcha/i.test(detail))
    throw new RedditRateLimitError(
      "Reddit presented a CAPTCHA. Inspect the selected profile natively before testing again.",
      "captcha",
      retryAfterSeconds,
    );
  if (/challenge|suspicious.?login|verification required/i.test(detail))
    throw new RedditRateLimitError(
      "Reddit presented an account challenge. Inspect the selected profile natively before testing again.",
      "challenge",
      retryAfterSeconds,
    );
  if (/suspended|locked|account.*restricted|restriction/i.test(detail))
    throw new RedditRestrictionError(
      "Reddit reported an account restriction. Mentionish will not use this profile.",
    );
  if (/forbidden|access denied|policy denial|http 403/i.test(detail))
    throw new RedditRestrictionError(
      "Reddit denied access. Mentionish will not retry through another profile or connector.",
      "access_denial",
    );
  if (
    /BROWSER_CONNECT|profile.*not connected|unauthorized|not logged|login required|bridge.*disconnected|daemon.*not running|econnrefused|http 401/i.test(
      detail,
    )
  )
    throw new RedditAuthenticationError(
      /BROWSER_CONNECT|profile.*not connected/i.test(detail)
        ? "The selected OpenCLI browser profile is not connected. Choose an ID or alias shown by opencli profile list."
        : "The Reddit browser session is unavailable or unauthorized.",
    );
  if (/rate.?limit|429|too many requests/i.test(detail))
    throw new RedditRateLimitError(
      "Reddit rate-limited the supervised read. Mentionish will not retry before any reported cooldown.",
      "rate_limit",
      retryAfterSeconds,
    );
  throw new Error(
    `OpenCLI Reddit read failed with exit code ${result.exitCode}.`,
  );
}
function command(): { executable: string; prefix: string[] } {
  if (process.platform !== "win32")
    return { executable: "opencli", prefix: [] };
  const appData = process.env.APPDATA;
  if (!appData)
    throw new Error("APPDATA is unavailable for the OpenCLI installation.");
  return {
    executable: process.execPath,
    prefix: [
      join(
        appData,
        "npm",
        "node_modules",
        "@jackwener",
        "opencli",
        "dist",
        "src",
        "main.js",
      ),
    ],
  };
}
function runOpenCli(
  args: readonly string[],
  signal: AbortSignal,
  profile?: string | null,
): Promise<OpenCliResult> {
  if (
    args[0] !== "reddit" ||
    !["search", "read", "whoami"].includes(args[1] ?? "")
  )
    throw new Error(
      "Only allowlisted read-only Reddit commands are permitted.",
    );
  return new Promise((resolve, reject) => {
    const launch = command();
    const child = spawn(
      launch.executable,
      [...launch.prefix, ...(profile ? ["--profile", profile] : []), ...args],
      {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let bytes = 0;
    let done = false;
    const finish = (error?: Error, result?: OpenCliResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => {
      child.kill();
      finish(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    const collect = (target: Buffer[], chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) {
        child.kill();
        finish(new Error("OpenCLI Reddit exceeded its output limit."));
      } else target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(out, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(err, chunk));
    child.once("error", (error) =>
      finish(new Error(`Unable to start OpenCLI Reddit: ${error.message}`)),
    );
    child.once("close", (code) =>
      finish(undefined, {
        exitCode: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("OpenCLI Reddit timed out."));
    }, 60_000);
    timer.unref();
  });
}
function normalizePost(
  raw: unknown,
  discoveryQuery?: string,
): LocalScannedItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as SearchItem;
  const id = string(item.id);
  const url = string(item.url);
  if (!id || !url) return null;
  const created = number(item.created_utc);
  return {
    platform: "reddit",
    externalId: id,
    itemType: "story",
    threadExternalId: id,
    title: string(item.title),
    body: string(item.selftext),
    author: string(item.author) || null,
    url,
    sourceCreatedAt: created ? new Date(created * 1000).toISOString() : null,
    metadata: {
      score: number(item.score),
      comments: number(item.comments),
      subreddit: string(item.subreddit).replace(/^r\//i, "").toLowerCase(),
      discovery_queries: discoveryQuery ? [discoveryQuery] : [],
    },
  };
}
function normalizeComments(
  raw: unknown[],
  post: LocalScannedItem,
): LocalScannedItem[] {
  return raw.flatMap((value, index) => {
    if (typeof value !== "object" || value === null) return [];
    const item = value as ThreadItem;
    if (string(item.type) === "POST") return [];
    const body = string(item.text);
    const author = string(item.author);
    if (!body || body.startsWith("[+")) return [];
    const id =
      "comment-" +
      createHash("sha256")
        .update(`${post.externalId}\n${author}\n${body}`)
        .digest("hex")
        .slice(0, 24);
    return [
      {
        platform: "reddit" as const,
        externalId: id,
        itemType: "comment" as const,
        parentExternalId: post.externalId,
        threadExternalId: post.externalId,
        title: post.title,
        body,
        author: author || null,
        url: post.url,
        sourceCreatedAt: null,
        metadata: {
          score: number(item.score),
          depth: string(item.type),
          synthetic_identity: true,
          order: index,
          subreddit: post.metadata?.subreddit ?? null,
          thread_title: post.title.slice(0, 500),
          thread_body: post.body.slice(0, 2_000),
          discovery_queries: post.metadata?.discovery_queries ?? [],
        },
      },
    ];
  });
}

export function selectThreadsForCommentExpansion(
  posts: readonly LocalScannedItem[],
  queries: readonly string[],
  maximum = 10,
): LocalScannedItem[] {
  const selected: LocalScannedItem[] = [];
  const selectedIds = new Set<string>();
  for (const query of queries) {
    const post = posts.find(
      (candidate) =>
        !selectedIds.has(candidate.externalId) &&
        Array.isArray(candidate.metadata?.discovery_queries) &&
        candidate.metadata.discovery_queries.includes(query),
    );
    if (!post) continue;
    selected.push(post);
    selectedIds.add(post.externalId);
    if (selected.length >= maximum) return selected;
  }
  for (const post of posts) {
    if (selectedIds.has(post.externalId)) continue;
    selected.push(post);
    selectedIds.add(post.externalId);
    if (selected.length >= maximum) break;
  }
  return selected;
}
export interface RedditAccountSnapshot {
  username: string;
  totalKarma: number | null;
  accountCreated: string | null;
  verifiedEmail: boolean | null;
}
export interface RedditFetchResult {
  items: LocalScannedItem[];
  commands: number;
}
export interface RedditSource {
  verify(
    signal: AbortSignal,
    profile?: string | null,
  ): Promise<RedditAccountSnapshot>;
  fetch(
    phrases: readonly string[],
    signal: AbortSignal,
    onProgress: (message: string) => void,
    options?: { days?: 30 | 90 },
  ): Promise<RedditFetchResult>;
}
export class OpenCliRedditSource implements RedditSource {
  constructor(private readonly profile: () => string | null = () => null) {}
  async verify(
    signal: AbortSignal,
    profile = this.profile(),
  ): Promise<RedditAccountSnapshot> {
    const result = await runOpenCli(
      [
        "reddit",
        "whoami",
        "-f",
        "json",
        "--window",
        "background",
        "--site-session",
        "persistent",
      ],
      signal,
      profile,
    );
    if (result.exitCode !== 0) failure(result);
    const fields = Object.fromEntries(
      parseArray(result.stdout).flatMap((value) => {
        if (typeof value !== "object" || value === null) return [];
        const row = value as { field?: unknown; value?: unknown };
        return [[string(row.field), string(row.value)]];
      }),
    );
    const username = fields.Username ?? "";
    if (!username)
      throw new RedditAuthenticationError(
        "OpenCLI did not return a verified Reddit username.",
      );
    const karma = Number.parseInt(fields["Total Karma"] ?? "", 10);
    return {
      username,
      totalKarma: Number.isFinite(karma) ? karma : null,
      accountCreated: fields["Account Created"] || null,
      verifiedEmail: fields["Verified Email"]
        ? fields["Verified Email"] === "Yes"
        : null,
    };
  }
  async fetch(
    phrases: readonly string[],
    signal: AbortSignal,
    onProgress: (message: string) => void,
    options: { days?: 30 | 90 } = {},
  ): Promise<RedditFetchResult> {
    const selected = [...new Set(phrases)].slice(0, 10);
    const posts = new Map<string, LocalScannedItem>();
    let commands = 0;
    for (const phrase of selected) {
      onProgress(`Searching Reddit for “${phrase}”...`);
      const result = await runOpenCli(
        [
          "reddit",
          "search",
          phrase,
          "--sort",
          "relevance",
          "--time",
          (options.days ?? 30) > 30 ? "year" : "month",
          "--limit",
          "10",
          "-f",
          "json",
          "--window",
          "background",
          "--site-session",
          "persistent",
        ],
        signal,
        this.profile(),
      );
      commands += 1;
      if (result.exitCode !== 0) failure(result);
      for (const raw of parseArray(result.stdout)) {
        const post = normalizePost(raw, phrase);
        if (post) {
          const existing = posts.get(post.externalId);
          if (!existing) posts.set(post.externalId, post);
          else {
            const queries = new Set([
              ...((existing.metadata?.discovery_queries as
                string[] | undefined) ?? []),
              phrase,
            ]);
            existing.metadata = {
              ...(existing.metadata ?? {}),
              discovery_queries: [...queries],
            };
          }
        }
      }
    }
    const cutoff = Date.now() - (options.days ?? 30) * 86_400_000;
    const items = [...posts.values()].filter(
      (post) =>
        !post.sourceCreatedAt || Date.parse(post.sourceCreatedAt) >= cutoff,
    );
    // Search results are inserted query-by-query. Taking the first ten would
    // therefore expand comments for only the first search lane and starve the
    // other product hypotheses. Sample one thread per query before filling any
    // remaining capacity so every demand lane gets comparable depth.
    for (const post of selectThreadsForCommentExpansion(items, selected, 10)) {
      const subreddit =
        typeof post.metadata?.subreddit === "string"
          ? post.metadata.subreddit
          : "reddit";
      onProgress(`Reading comments in r/${subreddit}...`);
      const result = await runOpenCli(
        [
          "reddit",
          "read",
          post.externalId,
          "--limit",
          "10",
          "--depth",
          "2",
          "--replies",
          "3",
          "--max-length",
          "1500",
          "-f",
          "json",
          "--window",
          "background",
          "--site-session",
          "persistent",
        ],
        signal,
        this.profile(),
      );
      commands += 1;
      if (result.exitCode !== 0) failure(result);
      items.push(...normalizeComments(parseArray(result.stdout), post));
    }
    return { items, commands };
  }
}
