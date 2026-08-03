import { createHash } from "node:crypto";
import {
  discoveredPostInputSchema,
  type DiscoveredPostInput,
} from "@mentionish/types";
import type { PlatformAdapter, PlatformFetchResult } from "./types.js";

type FetchLike = typeof fetch;

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

export interface RedditRateLimitSnapshot {
  used: number | null;
  remaining: number | null;
  resetSeconds: number | null;
  retryAfterSeconds: number | null;
}

export interface RedditResponseCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface RedditAdapterOptions {
  maxQueriesPerScan?: number;
  rotationSeed?: () => number;
  onRateLimit?: (snapshot: RedditRateLimitSnapshot) => void;
  cache?: RedditResponseCache;
  cacheTtlSeconds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numericHeader(headers: Headers, name: string): number | null {
  const rawValue = headers.get(name);
  if (rawValue === null || rawValue.trim() === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

export function redditRateLimitSnapshot(
  headers: Headers,
): RedditRateLimitSnapshot {
  return {
    used: numericHeader(headers, "x-ratelimit-used"),
    remaining: numericHeader(headers, "x-ratelimit-remaining"),
    resetSeconds: numericHeader(headers, "x-ratelimit-reset"),
    retryAfterSeconds: numericHeader(headers, "retry-after"),
  };
}

export function redditExternalId(input: unknown): string | null {
  if (!isRecord(input)) return null;
  return optionalString(input.id) ?? null;
}

export function isDeletedRedditPost(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return (
    input.removed_by_category != null ||
    input.author === "[deleted]" ||
    input.selftext === "[deleted]" ||
    input.selftext === "[removed]"
  );
}

export function normalizeRedditPost(
  input: unknown,
): DiscoveredPostInput | null {
  if (!isRecord(input) || isDeletedRedditPost(input)) return null;
  const id = optionalString(input.id);
  const title = optionalString(input.title);
  const permalink = optionalString(input.permalink);
  if (!id || !title || !permalink) return null;

  const createdAt =
    typeof input.created_utc === "number" && Number.isFinite(input.created_utc)
      ? new Date(input.created_utc * 1000).toISOString()
      : null;

  return discoveredPostInputSchema.parse({
    platform: "reddit",
    external_id: id,
    subreddit: optionalString(input.subreddit)?.toLowerCase() ?? null,
    title,
    body: optionalString(input.selftext) ?? "",
    author: optionalString(input.author) ?? null,
    url: new URL(permalink, "https://www.reddit.com").toString(),
    source_created_at: createdAt,
    source_updated_at: null,
    raw_metadata: {
      outbound_url: optionalString(input.url) ?? null,
      score: typeof input.score === "number" ? input.score : null,
      num_comments:
        typeof input.num_comments === "number" ? input.num_comments : null,
    },
  });
}

function listingPosts(input: unknown): unknown[] {
  if (!isRecord(input) || !isRecord(input.data)) return [];
  const children = input.data.children;
  if (!Array.isArray(children)) return [];
  return children.flatMap((child) =>
    isRecord(child) && isRecord(child.data) ? [child.data] : [],
  );
}

function rotatedBudget(
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

export class RedditAuthenticationError extends Error {}

export class RedditRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
  }
}

export class RedditAdapter implements PlatformAdapter {
  readonly platform = "reddit" as const;
  private token: { value: string; expiresAt: number } | undefined;
  private readonly maxQueriesPerScan: number;
  private readonly rotationSeed: () => number;
  private readonly onRateLimit: (snapshot: RedditRateLimitSnapshot) => void;
  private readonly cache: RedditResponseCache | undefined;
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly credentials: RedditCredentials,
    private readonly fetchFn: FetchLike = fetch,
    options: RedditAdapterOptions = {},
  ) {
    this.maxQueriesPerScan = Math.max(
      1,
      Math.min(100, options.maxQueriesPerScan ?? 20),
    );
    this.rotationSeed =
      options.rotationSeed ?? (() => Math.floor(Date.now() / (25 * 60 * 1000)));
    this.onRateLimit = options.onRateLimit ?? (() => undefined);
    this.cache = options.cache;
    this.cacheTtlSeconds = Math.max(
      1,
      Math.min(300, options.cacheTtlSeconds ?? 300),
    );
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }

    const authorization = Buffer.from(
      `${this.credentials.clientId}:${this.credentials.clientSecret}`,
    ).toString("base64");
    const response = await this.fetchFn(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this.credentials.userAgent,
        },
        body: "grant_type=client_credentials",
      },
    );
    if (!response.ok) {
      throw new RedditAuthenticationError(
        `Reddit authentication failed with status ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.access_token !== "string") {
      throw new RedditAuthenticationError(
        "Reddit authentication returned no access token.",
      );
    }
    const expiresIn =
      typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return this.token.value;
  }

  private async authenticatedJson(
    url: URL,
  ): Promise<{ payload: unknown; rateLimit: RedditRateLimitSnapshot }> {
    const token = await this.accessToken();
    const response = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": this.credentials.userAgent,
      },
    });
    const rateLimit = redditRateLimitSnapshot(response.headers);
    this.onRateLimit(rateLimit);

    if (response.status === 401 || response.status === 403) {
      this.token = undefined;
      throw new RedditAuthenticationError(
        `Reddit API authorization failed with status ${response.status}.`,
      );
    }
    if (response.status === 429) {
      throw new RedditRateLimitError(
        "Reddit API rate limit is exhausted.",
        rateLimit.retryAfterSeconds ?? rateLimit.resetSeconds,
      );
    }
    if (!response.ok) {
      throw new Error(`Reddit request failed with status ${response.status}.`);
    }
    return {
      payload: (await response.json()) as unknown,
      rateLimit,
    };
  }

  async fetch(keywords: readonly string[]): Promise<PlatformFetchResult> {
    const selectedKeywords = rotatedBudget(
      keywords,
      this.maxQueriesPerScan,
      this.rotationSeed(),
    );
    if (selectedKeywords.length === 0) {
      return { posts: [], queryCount: 0, deletedExternalIds: [] };
    }

    const byId = new Map<string, DiscoveredPostInput>();
    const deletedIds = new Set<string>();
    let queryCount = 0;

    for (const keyword of selectedKeywords) {
      const url = new URL("https://oauth.reddit.com/search");
      url.searchParams.set("q", keyword);
      url.searchParams.set("sort", "new");
      url.searchParams.set("type", "link");
      url.searchParams.set("limit", "100");
      const cacheKey =
        "mentionish:reddit:search:v1:" +
        createHash("sha256").update(keyword).digest("hex");
      const cachedPayload = this.cache ? await this.cache.get(cacheKey) : null;
      const response =
        cachedPayload === null
          ? await this.authenticatedJson(url)
          : { payload: cachedPayload, rateLimit: null };
      if (cachedPayload === null) {
        queryCount += 1;
        await this.cache?.set(cacheKey, response.payload, this.cacheTtlSeconds);
      }
      const { payload, rateLimit } = response;

      for (const rawPost of listingPosts(payload)) {
        const externalId = redditExternalId(rawPost);
        if (externalId && isDeletedRedditPost(rawPost)) {
          deletedIds.add(externalId);
          byId.delete(externalId);
          continue;
        }
        const post = normalizeRedditPost(rawPost);
        if (post && !deletedIds.has(post.external_id)) {
          byId.set(post.external_id, post);
        }
      }
      if (
        rateLimit?.remaining !== null &&
        rateLimit?.remaining !== undefined &&
        rateLimit.remaining <= 1
      ) {
        break;
      }
    }

    return {
      posts: [...byId.values()],
      queryCount,
      deletedExternalIds: [...deletedIds],
    };
  }

  async revalidate(externalIds: readonly string[]): Promise<Set<string>> {
    const normalizedIds = [
      ...new Set(externalIds.filter((id) => /^[\w-]+$/.test(id))),
    ].slice(0, 100);
    if (normalizedIds.length === 0) return new Set();

    const url = new URL("https://oauth.reddit.com/api/info");
    url.searchParams.set("id", normalizedIds.map((id) => `t3_${id}`).join(","));
    const { payload } = await this.authenticatedJson(url);
    const liveIds = new Set<string>();
    for (const rawPost of listingPosts(payload)) {
      const id = redditExternalId(rawPost);
      if (id && !isDeletedRedditPost(rawPost)) liveIds.add(id);
    }
    return liveIds;
  }
}
