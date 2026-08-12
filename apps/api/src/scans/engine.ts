import { matchingListeningPhrases, planSearchQueries } from "./relevance.js";
import type {
  LocalDiscoveryRepository,
  LocalProductRepository,
  LocalScannedItem,
} from "@mentionish/database";
import {
  type RedditSource,
  RedditAuthenticationError,
  RedditRateLimitError,
} from "./reddit-opencli.js";

interface AlgoliaHit {
  objectID?: string;
  _tags?: string[];
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  url?: string | null;
  author?: string | null;
  created_at?: string | null;
  created_at_i?: number;
  story_id?: number | null;
  parent_id?: number | null;
  points?: number | null;
  num_comments?: number | null;
}
interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}
export interface ScanStartResult {
  status: "started";
  scanId: string;
}

export interface ConversationClassifier {
  classify(input: {
    platform: "reddit" | "hackernews";
    productName: string;
    productDescription: string;
    productAudience?: string | null;
    matchedPhrases: string[];
    title: string;
    body: string;
  }): Promise<ConversationFitScores & { reasoning: string }>;
}

export interface ConversationFitScores {
  audienceFit: number;
  problemFit: number;
  solutionSeeking: number;
  buyingIntent: number;
  replyAppropriateness: number;
  hasDirectProductNeed?: boolean;
  seeksProductCategory?: boolean;
  promotesCompetingSolution?: boolean;
}
export type QualificationLabel =
  "rejected" | "worth_helping" | "potential_buyer";

export function qualificationDecision(scores: ConversationFitScores): {
  label: QualificationLabel;
  overallScore: number;
} {
  const audience = Math.max(0, Math.min(100, Math.round(scores.audienceFit)));
  const problem = Math.max(0, Math.min(100, Math.round(scores.problemFit)));
  const solution = Math.max(
    0,
    Math.min(100, Math.round(scores.solutionSeeking)),
  );
  const buying = Math.max(0, Math.min(100, Math.round(scores.buyingIntent)));
  const reply = Math.max(
    0,
    Math.min(100, Math.round(scores.replyAppropriateness)),
  );
  const overallScore = Math.round(
    audience * 0.15 +
      problem * 0.3 +
      solution * 0.2 +
      buying * 0.25 +
      reply * 0.1,
  );
  if (scores.promotesCompetingSolution === true)
    return { label: "rejected", overallScore };
  if (scores.hasDirectProductNeed === false) {
    if (
      audience >= 70 &&
      problem >= 25 &&
      solution >= 80 &&
      buying >= 35 &&
      reply >= 85
    )
      return { label: "worth_helping", overallScore };
    return { label: "rejected", overallScore };
  }
  if (
    audience >= 60 &&
    problem >= 70 &&
    solution >= 60 &&
    buying >= 60 &&
    reply >= 60 &&
    scores.seeksProductCategory === true
  )
    return { label: "potential_buyer", overallScore };
  if (audience >= 50 && problem >= 65 && solution >= 40 && reply >= 65)
    return { label: "worth_helping", overallScore };
  return { label: "rejected", overallScore };
}
function normalizedDedupText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function conversationDedupKey(item: LocalScannedItem): string {
  const author = normalizedDedupText(item.author);
  const title = normalizedDedupText(item.title);
  if (author && title.length >= 20) return `author-title:${author}:${title}`;
  const body = normalizedDedupText(item.body).slice(0, 320);
  if (author && body.length >= 80) return `author-body:${author}:${body}`;
  return `source:${item.platform}:${item.externalId}`;
}

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<p\s*\/?>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeHit(hit: AlgoliaHit): LocalScannedItem | null {
  if (!hit.objectID) return null;
  const comment = hit._tags?.includes("comment") ?? Boolean(hit.comment_text);
  const threadId = String(hit.story_id ?? hit.objectID);
  return {
    platform: "hackernews",
    externalId: hit.objectID,
    itemType: comment ? "comment" : "story",
    parentExternalId: hit.parent_id == null ? null : String(hit.parent_id),
    threadExternalId: threadId,
    title: plainText(hit.title ?? hit.story_title),
    body: plainText(comment ? hit.comment_text : hit.story_text),
    author: hit.author ?? null,
    url: comment
      ? `https://news.ycombinator.com/item?id=${threadId}#${hit.objectID}`
      : `https://news.ycombinator.com/item?id=${hit.objectID}`,

    sourceCreatedAt:
      hit.created_at ??
      (hit.created_at_i
        ? new Date(hit.created_at_i * 1000).toISOString()
        : null),
    metadata: {
      points: hit.points ?? null,
      comments: hit.num_comments ?? null,
      external_url: hit.url ?? null,
    },
  };
}

function completedMessage(
  fetched: number,
  matched: number,
  rejected: number,
  qualified: number,
  found: number,
): string {
  if (found > 0)
    return `Reviewed ${fetched} source items. AI qualified ${qualified}; ${found} new conversation${found === 1 ? "" : "s"} were added.`;
  if (qualified > 0)
    return `Reviewed ${fetched} source items. AI qualified ${qualified}, but they were already in Conversations.`;
  if (matched > 0)
    return `Reviewed ${fetched} source items. ${matched} matched listening phrases and AI rejected ${rejected} as insufficiently relevant.`;
  return `Reviewed ${fetched} source items. None matched the approved listening phrases closely enough for AI review.`;
}

export class LocalScanEngine {
  private readonly controllers = new Map<string, AbortController>();
  constructor(
    private readonly products: LocalProductRepository,
    private readonly discovery: LocalDiscoveryRepository,
    private readonly fetcher: typeof fetch = fetch,
    private readonly redditSource?: RedditSource,
    private readonly redditEnabled = false,
    private readonly classifier?: ConversationClassifier,
    private readonly classificationReady: () => boolean = () => true,
  ) {
    this.discovery.recoverInterrupted();
  }
  async verifyRedditProfile(
    profile: string | null,
  ): Promise<Record<string, unknown>> {
    if (!this.redditSource || !this.redditEnabled)
      throw new Error("REDDIT_DISABLED");
    if (profile !== null && !/^[A-Za-z0-9_-]{1,50}$/.test(profile))
      throw new Error("INVALID_REDDIT_PROFILE");
    const account = await this.redditSource.verify(
      new AbortController().signal,
      profile,
    );
    this.discovery.saveRedditVerification(profile, { ...account });
    return { ...account, profile, kill_switch: false };
  }
  redditConfiguration(): Record<string, unknown> {
    return {
      enabled: this.redditEnabled,
      profile: this.discovery.redditProfile(),
      verified_account: this.discovery.redditVerifiedAccount(),
      kill_switch: this.discovery.isRedditHalted(),
    };
  }
  start(productId?: string): ScanStartResult {
    if (this.discovery.activeScan()) throw new Error("SCAN_ALREADY_RUNNING");
    if (!this.classifier || !this.classificationReady())
      throw new Error("AI_CLASSIFICATION_NOT_CONFIGURED");
    const selected = productId
      ? [this.products.get(productId)].filter(Boolean)
      : this.products.list();
    const active = selected.filter(
      (product) => product?.isActive && !product.deletedAt,
    );
    if (productId && active.length === 0) throw new Error("PRODUCT_NOT_FOUND");
    if (active.length === 0) throw new Error("NO_ACTIVE_PRODUCTS");
    const queryCount = Math.min(
      60,
      active.reduce(
        (total, product) =>
          total +
          planSearchQueries(
            product!.phrases
              .filter(
                (phrase) => phrase.isActive && phrase.kind !== "exclusion",
              )
              .map((phrase) => phrase.normalizedPhrase),
            12,
          ).length *
            2,
        0,
      ),
    );
    if (!queryCount) throw new Error("NO_ACTIVE_PHRASES");
    const scan = this.discovery.createScan(
      productId ? "product" : "all",
      active.map((product) => product!.id),
      queryCount,
    );
    const controller = new AbortController();
    this.controllers.set(scan.id, controller);
    setImmediate(() => void this.run(scan.id, controller));
    return { status: "started", scanId: scan.id };
  }
  cancel(scanId: string): boolean {
    const changed = this.discovery.requestCancel(scanId);
    if (changed) this.controllers.get(scanId)?.abort();
    return changed;
  }
  private async saveIfQualified(
    scanId: string,
    product: {
      id: string;
      name: string;
      description: string;
      audience: string | null;
    },
    item: LocalScannedItem,
    matches: string[],
    seen: Set<string>,
  ): Promise<
    "duplicate" | "rejected" | "qualified-new" | "qualified-existing"
  > {
    const identity = `${product.id}:${conversationDedupKey(item)}`;
    if (seen.has(identity)) return "duplicate";
    seen.add(identity);
    this.discovery.updateScan(scanId, {
      current_message: `AI is qualifying a ${item.platform === "reddit" ? "Reddit" : "Hacker News"} conversation...`,
    });
    try {
      const result = await this.classifier!.classify({
        platform: item.platform,
        productName: product.name,
        productDescription: product.description,
        productAudience: product.audience,
        matchedPhrases: matches,
        title: item.title,
        body: item.body,
      });
      const qualification = qualificationDecision(result);
      const decision =
        qualification.label === "rejected" ? "rejected" : "qualified";
      const inserted = this.discovery.saveClassification(
        scanId,
        product.id,
        item,
        matches,
        { ...result, ...qualification },
        decision,
      );
      if (decision === "rejected") return "rejected";
      return inserted ? "qualified-new" : "qualified-existing";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The AI provider failed.";
      throw new Error(`AI classification failed: ${message}`, { cause: error });
    }
  }

  private async run(
    scanId: string,
    controller: AbortController,
  ): Promise<void> {
    const now = new Date().toISOString();
    let completed = 0;
    let fetched = 0;
    let redditFetched = 0;
    let hackerNewsFetched = 0;
    let matched = 0;
    let rejected = 0;
    let qualified = 0;
    let redditMatched = 0;
    let redditRejected = 0;
    let redditQualified = 0;
    let hackerNewsMatched = 0;
    let hackerNewsRejected = 0;
    let hackerNewsQualified = 0;
    let found = 0;
    let redditWarning: string | null = null;
    this.discovery.updateScan(scanId, {
      status: "running",
      started_at: now,
      current_message: this.redditEnabled
        ? "Starting supervised Reddit scan..."
        : "Searching recent Hacker News conversations...",
    });
    try {
      const scan = this.discovery.getScan(scanId)!;
      productLoop: for (const productId of scan.product_ids) {
        const product = this.products.get(productId);
        if (!product) continue;
        const classifiedItems = new Set<string>();
        const include = product.phrases
          .filter((phrase) => phrase.isActive && phrase.kind !== "exclusion")
          .map((phrase) => phrase.normalizedPhrase);
        const hackerNewsQueries = planSearchQueries(include, 12);
        const redditQueries = planSearchQueries(include, 6);
        const exclude = product.phrases
          .filter((phrase) => phrase.isActive && phrase.kind === "exclusion")
          .map((phrase) => phrase.normalizedPhrase);
        if (
          this.redditEnabled &&
          this.redditSource &&
          this.discovery.redditVerifiedAccount() &&
          !this.discovery.isRedditHalted()
        ) {
          try {
            const reddit = await this.redditSource.fetch(
              redditQueries,
              controller.signal,
              (message) =>
                this.discovery.updateScan(scanId, {
                  current_message: message,
                }),
            );
            fetched += reddit.items.length;
            redditFetched += reddit.items.length;
            for (const item of reddit.items) {
              if (
                matchingListeningPhrases(item, exclude, {
                  requireHelpIntent: false,
                }).length > 0
              )
                continue;
              const matches = matchingListeningPhrases(item, include);
              if (!matches.length) continue;
              const decision = await this.saveIfQualified(
                scanId,
                product,
                item,
                matches,
                classifiedItems,
              );
              if (decision === "duplicate") continue;
              matched += 1;
              redditMatched += 1;
              if (decision === "rejected") {
                rejected += 1;
                redditRejected += 1;
              } else {
                qualified += 1;
                redditQualified += 1;
                if (decision === "qualified-new") found += 1;
              }
            }
            this.discovery.updateScan(scanId, {
              items_fetched: fetched,
              reddit_items_fetched: redditFetched,
              hackernews_items_fetched: hackerNewsFetched,
              candidates_matched: matched,
              candidates_rejected: rejected,
              candidates_qualified: qualified,
              reddit_candidates_matched: redditMatched,
              reddit_candidates_rejected: redditRejected,
              reddit_candidates_qualified: redditQualified,
              hackernews_candidates_matched: hackerNewsMatched,
              hackernews_candidates_rejected: hackerNewsRejected,
              hackernews_candidates_qualified: hackerNewsQualified,
              opportunities_found: found,
              current_message:
                "Reddit read complete. Running Hacker News fallback...",
            });
          } catch (error) {
            if (
              controller.signal.aborted ||
              (error instanceof DOMException && error.name === "AbortError")
            )
              throw error;
            if (
              error instanceof Error &&
              error.message.startsWith("AI classification failed:")
            )
              throw error;
            redditWarning =
              error instanceof Error
                ? error.message.slice(0, 300)
                : "Reddit read failed.";
            if (
              error instanceof RedditAuthenticationError ||
              error instanceof RedditRateLimitError
            )
              this.discovery.haltReddit(redditWarning);
          }
        } else if (this.redditEnabled && this.discovery.isRedditHalted()) {
          redditWarning =
            "Reddit is paused by its kill switch. Check the selected browser profile before clearing it.";
        } else if (
          this.redditEnabled &&
          !this.discovery.redditVerifiedAccount()
        ) {
          redditWarning =
            "Reddit profile is not verified. Open Settings, choose the dedicated OpenCLI profile, and run Test read.";
        }
        for (const phrase of hackerNewsQueries)
          for (const tag of ["story", "comment"] as const) {
            if (completed >= scan.queries_total) break productLoop;
            if (
              controller.signal.aborted ||
              this.discovery.isCancelRequested(scanId)
            )
              throw new DOMException("Cancelled", "AbortError");
            this.discovery.updateScan(scanId, {
              current_message: `Searching ${tag === "story" ? "posts" : "comments"} for “${phrase}”...`,
            });
            const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
            const parameters = new URLSearchParams({
              query: phrase,
              tags: tag,
              numericFilters: `created_at_i>${cutoff}`,
              hitsPerPage: "20",
            });
            const response = await this.fetcher(
              `https://hn.algolia.com/api/v1/search_by_date?${parameters}`,
              {
                signal: controller.signal,
                headers: { accept: "application/json" },
              },
            );
            if (!response.ok)
              throw new Error(
                `Hacker News search returned HTTP ${response.status}.`,
              );
            const payload = (await response.json()) as AlgoliaResponse;
            const items = (payload.hits ?? [])
              .map(normalizeHit)
              .filter((item): item is LocalScannedItem => item !== null);
            fetched += items.length;
            hackerNewsFetched += items.length;
            for (const item of items) {
              const blocked =
                matchingListeningPhrases(item, exclude, {
                  requireHelpIntent: false,
                }).length > 0;
              if (blocked) continue;
              const matches = matchingListeningPhrases(item, include);
              if (!matches.length) continue;
              const decision = await this.saveIfQualified(
                scanId,
                product,
                item,
                matches,
                classifiedItems,
              );
              if (decision === "duplicate") continue;
              matched += 1;
              hackerNewsMatched += 1;
              if (decision === "rejected") {
                rejected += 1;
                hackerNewsRejected += 1;
              } else {
                qualified += 1;
                hackerNewsQualified += 1;
                if (decision === "qualified-new") found += 1;
              }
            }
            completed += 1;
            this.discovery.updateScan(scanId, {
              queries_completed: completed,
              items_fetched: fetched,
              reddit_items_fetched: redditFetched,
              hackernews_items_fetched: hackerNewsFetched,
              candidates_matched: matched,
              candidates_rejected: rejected,
              candidates_qualified: qualified,
              reddit_candidates_matched: redditMatched,
              reddit_candidates_rejected: redditRejected,
              reddit_candidates_qualified: redditQualified,
              hackernews_candidates_matched: hackerNewsMatched,
              hackernews_candidates_rejected: hackerNewsRejected,
              hackernews_candidates_qualified: hackerNewsQualified,
              opportunities_found: found,
            });
          }
      }
      this.discovery.updateScan(scanId, {
        status: "succeeded",
        current_message: redditWarning
          ? `Hacker News completed, but Reddit was paused: ${redditWarning}`
          : completedMessage(fetched, matched, rejected, qualified, found),
        error_code: redditWarning ? "REDDIT_PAUSED" : null,
        error_message: redditWarning,
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      const cancelled =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      this.discovery.updateScan(
        scanId,
        cancelled
          ? {
              status: "cancelled",
              current_message: "Scan cancelled.",
              completed_at: new Date().toISOString(),
            }
          : {
              status: "failed",
              error_code:
                error instanceof Error &&
                error.message.startsWith("AI classification failed:")
                  ? "AI_CLASSIFICATION_FAILED"
                  : "SOURCE_UNAVAILABLE",
              error_message:
                error instanceof Error
                  ? error.message.slice(0, 300)
                  : "The scan failed.",
              current_message:
                error instanceof Error &&
                error.message.startsWith("AI classification failed:")
                  ? "Scan stopped because AI qualification failed. No unqualified conversations were saved."
                  : "Scan failed safely. Try again later.",
              completed_at: new Date().toISOString(),
            },
      );
    } finally {
      this.discovery.pruneCandidateAudits(10);
      this.controllers.delete(scanId);
    }
  }
}
