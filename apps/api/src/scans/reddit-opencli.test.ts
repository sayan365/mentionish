import { describe, expect, it } from "vitest";
import type { LocalScannedItem } from "@mentionish/database";
import {
  safeRedditSourceUrl,
  selectThreadsForCommentExpansion,
} from "./reddit-opencli.js";

function post(id: string, query: string): LocalScannedItem {
  return {
    platform: "reddit",
    externalId: id,
    itemType: "story",
    threadExternalId: id,
    title: id,
    body: "A sufficiently descriptive Reddit post body.",
    author: "founder",
    url: `https://www.reddit.com/comments/${id}`,
    sourceCreatedAt: "2026-08-20T00:00:00.000Z",
    metadata: { discovery_queries: [query] },
  };
}

describe("Reddit comment expansion", () => {
  it("samples threads across query lanes before expanding a second result", () => {
    const posts = [
      post("a-1", "query a"),
      post("a-2", "query a"),
      post("a-3", "query a"),
      post("b-1", "query b"),
      post("b-2", "query b"),
      post("c-1", "query c"),
    ];

    expect(
      selectThreadsForCommentExpansion(
        posts,
        ["query a", "query b", "query c"],
        5,
      ).map(({ externalId }) => externalId),
    ).toEqual(["a-1", "b-1", "c-1", "a-2", "a-3"]);
  });

  it("does not select the same thread twice when it matched multiple queries", () => {
    const shared = post("shared", "query a");
    shared.metadata = { discovery_queries: ["query a", "query b"] };

    expect(
      selectThreadsForCommentExpansion(
        [shared, post("b-2", "query b")],
        ["query a", "query b"],
        2,
      ).map(({ externalId }) => externalId),
    ).toEqual(["shared", "b-2"]);
  });
});

describe("Reddit source URL safety", () => {
  it("keeps native Reddit links and replaces non-native schemes or hosts", () => {
    expect(
      safeRedditSourceUrl(
        "abc123",
        "https://www.reddit.com/r/saas/comments/abc123/example/",
      ),
    ).toBe("https://www.reddit.com/r/saas/comments/abc123/example/");
    expect(safeRedditSourceUrl("abc123", "javascript:alert(1)")).toBe(
      "https://www.reddit.com/comments/abc123",
    );
    expect(
      safeRedditSourceUrl("abc/123", "https://reddit.com.evil.test/phish"),
    ).toBe("https://www.reddit.com/comments/abc%2F123");
  });
});
