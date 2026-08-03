import {
  discoveredPostInputSchema,
  type DiscoveredPostInput,
} from "@mentionish/types";
import type { PlatformAdapter, PlatformFetchResult } from "./types.js";

const API_ROOT = "https://hacker-news.firebaseio.com/v0";

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function htmlToPlainText(value: string): string {
  const withoutExecutableContent = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutExecutableContent.replace(/<[^>]*>/g, " ");
  return withoutTags
    .replace(
      /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi,
      (entity, decimal: string | undefined, hex: string | undefined) => {
        if (decimal) return String.fromCodePoint(Number(decimal));
        if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
        const named: Record<string, string> = {
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        };
        return named[String(entity).toLowerCase()] ?? String(entity);
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHackerNewsItem(
  input: unknown,
): DiscoveredPostInput | null {
  if (!isRecord(input) || input.type !== "story") return null;
  if (input.deleted === true || input.dead === true) return null;
  if (typeof input.id !== "number" || !Number.isSafeInteger(input.id)) {
    return null;
  }

  const title = optionalString(input.title);
  if (!title) return null;

  const sourceCreatedAt =
    typeof input.time === "number" && Number.isFinite(input.time)
      ? new Date(input.time * 1000).toISOString()
      : null;
  const discussionUrl = `https://news.ycombinator.com/item?id=${input.id}`;

  return discoveredPostInputSchema.parse({
    platform: "hackernews",
    external_id: String(input.id),
    title: htmlToPlainText(title),
    body: htmlToPlainText(optionalString(input.text) ?? ""),
    author: optionalString(input.by) ?? null,
    url: optionalString(input.url) ?? discussionUrl,
    source_created_at: sourceCreatedAt,
    source_updated_at: null,
    raw_metadata: {
      discussion_url: discussionUrl,
      score: typeof input.score === "number" ? input.score : null,
      descendants:
        typeof input.descendants === "number" ? input.descendants : null,
    },
  });
}

async function readJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(
      `Hacker News request failed with status ${response.status}.`,
    );
  }
  return response.json() as Promise<unknown>;
}

export class HackerNewsAdapter implements PlatformAdapter {
  readonly platform = "hackernews" as const;

  constructor(
    private readonly fetchFn: FetchLike = fetch,
    private readonly limitPerFeed = 50,
  ) {}

  async fetch(): Promise<PlatformFetchResult> {
    const feeds = await Promise.all([
      readJson(this.fetchFn, `${API_ROOT}/newstories.json`),
      readJson(this.fetchFn, `${API_ROOT}/askstories.json`),
    ]);
    const ids = [
      ...new Set(
        feeds.flatMap((feed) =>
          Array.isArray(feed)
            ? feed
                .filter(
                  (id): id is number =>
                    typeof id === "number" && Number.isSafeInteger(id),
                )
                .slice(0, this.limitPerFeed)
            : [],
        ),
      ),
    ];
    const items = await Promise.all(
      ids.map((id) => readJson(this.fetchFn, `${API_ROOT}/item/${id}.json`)),
    );
    const posts = items
      .map(normalizeHackerNewsItem)
      .filter((post): post is DiscoveredPostInput => post !== null);
    const deletedExternalIds = items.flatMap((item) =>
      isRecord(item) &&
      typeof item.id === "number" &&
      (item.deleted === true || item.dead === true)
        ? [String(item.id)]
        : [],
    );

    return {
      posts,
      queryCount: 2 + ids.length,
      deletedExternalIds,
    };
  }
}
