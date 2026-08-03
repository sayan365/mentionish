import type { DiscoveredPostInput, PlatformCode } from "@mentionish/types";

export interface PlatformFetchResult {
  posts: DiscoveredPostInput[];
  queryCount: number;
  deletedExternalIds?: string[];
}

export interface PlatformAdapter {
  readonly platform: PlatformCode;
  fetch(keywords: readonly string[]): Promise<PlatformFetchResult>;
}
