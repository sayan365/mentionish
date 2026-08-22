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
export class RedditAuthenticationError extends Error {}
export class RedditRateLimitError extends Error {}
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
  if (
    /BROWSER_CONNECT|profile.*not connected|forbidden|unauthorized|not logged|login required|bridge.*disconnected|daemon.*not running|econnrefused|40[13]/i.test(
      detail,
    )
  )
    throw new RedditAuthenticationError(
      /BROWSER_CONNECT|profile.*not connected/i.test(detail)
        ? "The selected OpenCLI browser profile is not connected. Choose an ID or alias shown by opencli profile list."
        : "The Reddit browser session is unavailable or unauthorized.",
    );
  if (
    /rate.?limit|429|too many requests|captcha|challenge|restricted/i.test(
      detail,
    )
  )
    throw new RedditRateLimitError(
      "Reddit stopped the supervised read. The Reddit kill switch is now active.",
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
    options?: { time?: "week" | "month" },
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
    options: { time?: "week" | "month" } = {},
  ): Promise<RedditFetchResult> {
    const selected = [...new Set(phrases)].slice(0, 6);
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
          "new",
          "--time",
          options.time ?? "week",
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
    const items = [...posts.values()];
    for (const post of items.slice(0, 10)) {
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
