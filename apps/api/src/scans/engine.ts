import {
  discoveryCandidateEvidence,
  matchingListeningPhrases,
  planSearchQueries,
  planOutcomeAnchorQueries,
  selectAdaptiveQueries,
} from "./relevance.js";
import type {
  LocalDiscoveryRepository,
  LocalDiscoveryProfile,
  LocalFeedbackCalibration,
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
export type ScanMode = "standard" | "deep";

export interface ConversationClassifier {
  planQueries?(input: {
    productName: string;
    productDescription: string;
    productAudience?: string | null;
    productDiscoveryProfile?: LocalDiscoveryProfile | null;
    listeningPhrases: string[];
    recentQueries: Array<{
      query: string;
      qualified: number;
      reviewed: number;
    }>;
  }): Promise<
    Array<{
      query: string;
      kind: string;
      platform?: "reddit" | "hackernews" | "both";
      rationale: string;
    }>
  >;
  classify(input: {
    platform: "reddit" | "hackernews";
    productName: string;
    productDescription: string;
    productAudience?: string | null;
    productDiscoveryProfile?: LocalDiscoveryProfile | null;
    matchedPhrases: string[];
    title: string;
    body: string;
  }): Promise<ConversationFitScores & { reasoning: string }>;
}

interface RankedDiscoveryCandidate {
  item: LocalScannedItem;
  matches: string[];
  discoveryScore: number;
  sourceQuery: string;
}

function discoveryProfileContext(
  profile: LocalDiscoveryProfile | null,
): string {
  if (!profile) return "";
  return [
    ...profile.audiences,
    ...profile.problems,
    ...profile.situations,
    ...profile.desired_outcomes,
    ...profile.alternatives,
    ...profile.buying_signals,
    ...profile.helpful_signals,
    ...profile.market_signals,
  ].join(" ");
}

function discoveryCandidates(
  items: LocalScannedItem[],
  include: string[],
  exclude: string[],
  productContext: string,
  searchQuery: string,
  maximum = 8,
  threadCounts: Map<string, number> = new Map(),
  calibration?: LocalFeedbackCalibration,
): RankedDiscoveryCandidate[] {
  const ranked = items
    .flatMap((item): RankedDiscoveryCandidate[] => {
      if (isUnavailableSourceItem(item)) return [];
      if (
        matchingListeningPhrases(item, exclude, {
          requireHelpIntent: false,
        }).length > 0
      )
        return [];
      const exact = matchingListeningPhrases(item, include);
      if (exact.length === 0 && `${item.title} ${item.body}`.trim().length < 80)
        return [];
      const attributedQueries = Array.isArray(item.metadata?.discovery_queries)
        ? item.metadata.discovery_queries.filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          )
        : [];
      const attributedQuery = attributedQueries[0] ?? searchQuery;
      const evidence = discoveryCandidateEvidence(
        item,
        include,
        productContext,
        attributedQuery,
      );
      const phraseAdjustments = exact.map(
        (phrase) =>
          calibration?.phraseAdjustments.get(
            phrase.trim().toLocaleLowerCase(),
          ) ?? 0,
      );
      const feedbackAdjustment = Math.max(
        -6,
        Math.min(
          6,
          (calibration?.sourceAdjustment ?? 0) +
            (phraseAdjustments.length > 0 ? Math.max(...phraseAdjustments) : 0),
        ),
      );
      const calibratedScore = evidence.score + feedbackAdjustment;
      const threshold =
        item.platform === "reddit"
          ? exact.length > 0
            ? 64
            : 72
          : exact.length > 0
            ? 56
            : 66;
      if (calibratedScore < threshold) return [];
      return [
        {
          item,
          matches:
            exact.length > 0
              ? exact
              : evidence.matchedPhrases.length > 0
                ? evidence.matchedPhrases
                : [`Adaptive hypothesis: ${attributedQuery}`],
          discoveryScore:
            exact.length > 0
              ? calibratedScore + 12 + exact.length
              : calibratedScore,
          sourceQuery: attributedQuery,
        },
      ];
    })
    .sort((left, right) => right.discoveryScore - left.discoveryScore);
  const selected: RankedDiscoveryCandidate[] = [];
  for (const candidate of ranked) {
    const thread = `${candidate.item.platform}:${candidate.item.threadExternalId ?? candidate.item.parentExternalId ?? candidate.item.externalId}`;
    const count = threadCounts.get(thread) ?? 0;
    if (count >= 2) continue;
    threadCounts.set(thread, count + 1);
    selected.push(candidate);
    if (selected.length >= maximum) break;
  }
  return selected;
}

export function isUnavailableSourceItem(item: LocalScannedItem): boolean {
  const unavailable = new Set(["[dead]", "[deleted]", "[removed]"]);
  const title = item.title.trim().toLocaleLowerCase();
  const body = item.body.trim().toLocaleLowerCase();
  return unavailable.has(title) || unavailable.has(body);
}

export function classificationConversationContext(item: LocalScannedItem): {
  title: string;
  body: string;
} {
  if (item.itemType !== "comment")
    return { title: item.title, body: item.body };
  const threadTitle =
    typeof item.metadata?.thread_title === "string"
      ? item.metadata.thread_title.trim().slice(0, 500)
      : item.title.trim().slice(0, 500);
  const threadBody =
    typeof item.metadata?.thread_body === "string"
      ? item.metadata.thread_body.trim().slice(0, 2_000)
      : "";
  const context = [
    `Comment:\n${item.body.trim()}`,
    threadTitle || threadBody
      ? `Thread context:\n${[threadTitle, threadBody].filter(Boolean).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8_000);
  return { title: threadTitle || item.title, body: context };
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
  needScope?: "core" | "adjacent" | "unrelated";
  authorState?: "asking" | "comparing" | "sharing" | "promoting";
  marketResearchValue?: number;
}
export type QualificationLabel =
  "rejected" | "worth_helping" | "potential_buyer";
export type DiscoveryTier =
  | "direct_opportunity"
  | "helpful_conversation"
  | "market_signal"
  | "irrelevant";

export function qualificationDecision(scores: ConversationFitScores): {
  label: QualificationLabel;
  tier: DiscoveryTier;
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
  const needScope =
    scores.needScope ??
    (scores.hasDirectProductNeed === false ? "adjacent" : "core");
  const authorState = scores.authorState ?? "asking";
  const marketResearch = Math.max(
    0,
    Math.min(100, Math.round(scores.marketResearchValue ?? 0)),
  );
  if (scores.promotesCompetingSolution === true)
    return {
      label: "rejected",
      tier:
        audience >= 40 && marketResearch >= 55 ? "market_signal" : "irrelevant",
      overallScore,
    };
  if (
    needScope === "core" &&
    audience >= 55 &&
    problem >= 60 &&
    solution >= 55 &&
    buying >= 50 &&
    reply >= 55 &&
    scores.seeksProductCategory === true
  )
    return {
      label: "potential_buyer",
      tier: "direct_opportunity",
      overallScore,
    };
  if (
    needScope !== "unrelated" &&
    (authorState === "asking" || authorState === "comparing") &&
    audience >= 50 &&
    problem >= 40 &&
    solution >= 40 &&
    reply >= 65
  )
    return {
      label: "worth_helping",
      tier: "helpful_conversation",
      overallScore,
    };
  if (marketResearch >= 60 && audience >= 40)
    return { label: "rejected", tier: "market_signal", overallScore };
  return { label: "rejected", tier: "irrelevant", overallScore };
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
      thread_title: comment ? plainText(hit.story_title) : null,
    },
  };
}

function completedMessage(
  fetched: number,
  matched: number,
  rejected: number,
  qualified: number,
  found: number,
  direct: number,
  helpful: number,
  marketSignals: number,
): string {
  if (found > 0)
    return `Reviewed ${fetched} source items. Found ${direct} direct, ${helpful} helpful, and ${marketSignals} market signal${marketSignals === 1 ? "" : "s"}; ${found} new conversation${found === 1 ? "" : "s"} were added.`;
  if (qualified > 0)
    return `Reviewed ${fetched} source items. Found ${direct} direct and ${helpful} helpful conversation${qualified === 1 ? "" : "s"}, but they were already saved.${marketSignals ? ` Also retained ${marketSignals} market signal${marketSignals === 1 ? "" : "s"}.` : ""}`;
  if (marketSignals > 0)
    return `Reviewed ${fetched} source items. No reply opportunity qualified, but ${marketSignals} market signal${marketSignals === 1 ? " was" : "s were"} retained for research.`;
  if (matched > 0)
    return `Reviewed ${fetched} source items. AI evaluated ${matched} lexical and conceptual candidates and rejected ${rejected} as insufficiently relevant.`;
  return `Reviewed ${fetched} source items. Adaptive retrieval found no candidates strong enough for AI review.`;
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
  start(productId?: string, mode: ScanMode = "standard"): ScanStartResult {
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
    setImmediate(() => void this.run(scan.id, controller, mode));
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
      discoveryProfile: LocalDiscoveryProfile | null;
    },
    item: LocalScannedItem,
    matches: string[],
    sourceQuery: string,
    seen: Set<string>,
  ): Promise<{
    status: "duplicate" | "rejected" | "qualified-new" | "qualified-existing";
    tier: DiscoveryTier | null;
  }> {
    const identity = `${product.id}:${conversationDedupKey(item)}`;
    if (seen.has(identity)) return { status: "duplicate", tier: null };
    seen.add(identity);
    this.discovery.updateScan(scanId, {
      current_message: `AI is qualifying a ${item.platform === "reddit" ? "Reddit" : "Hacker News"} conversation...`,
    });
    try {
      const conversationContext = classificationConversationContext(item);
      const result = await this.classifier!.classify({
        platform: item.platform,
        productName: product.name,
        productDescription: product.description,
        productAudience: product.audience,
        productDiscoveryProfile: product.discoveryProfile,
        matchedPhrases: matches,
        title: conversationContext.title,
        body: conversationContext.body,
      });
      const qualification = qualificationDecision(result);
      const decision =
        qualification.label === "rejected" ? "rejected" : "qualified";
      const inserted = this.discovery.saveClassification(
        scanId,
        product.id,
        item,
        matches,
        sourceQuery,
        { ...result, ...qualification },
        decision,
      );
      if (decision === "rejected")
        return { status: "rejected", tier: qualification.tier };
      return {
        status: inserted ? "qualified-new" : "qualified-existing",
        tier: qualification.tier,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The AI provider failed.";
      throw new Error(`AI classification failed: ${message}`, { cause: error });
    }
  }

  private async run(
    scanId: string,
    controller: AbortController,
    mode: ScanMode,
  ): Promise<void> {
    const now = new Date().toISOString();
    let completed = 0;
    let fetched = 0;
    let redditFetched = 0;
    let hackerNewsFetched = 0;
    let matched = 0;
    let rejected = 0;
    let qualified = 0;
    let direct = 0;
    let helpful = 0;
    let marketSignals = 0;
    let redditMatched = 0;
    let redditRejected = 0;
    let redditQualified = 0;
    let hackerNewsMatched = 0;
    let hackerNewsRejected = 0;
    let hackerNewsQualified = 0;
    let found = 0;
    let plannedTotal = 0;
    let queriesExplored = 0;
    let queriesReused = 0;
    let redditWarning: string | null = null;
    this.discovery.updateScan(scanId, {
      status: "running",
      started_at: now,
      current_message:
        "Planning new searches from product context and scan memory...",
    });
    try {
      const scan = this.discovery.getScan(scanId)!;
      for (const productId of scan.product_ids) {
        if (plannedTotal >= 60) break;
        const product = this.products.get(productId);
        if (!product) continue;
        const classifiedItems = new Set<string>();
        const threadCounts = new Map<string, number>();
        let productHackerNewsReviewed = 0;
        const include = product.phrases
          .filter((phrase) => phrase.isActive && phrase.kind !== "exclusion")
          .map((phrase) => phrase.normalizedPhrase);
        const exclude = product.phrases
          .filter((phrase) => phrase.isActive && phrase.kind === "exclusion")
          .map((phrase) => phrase.normalizedPhrase);
        exclude.push(...(product.discoveryProfile?.exclusions ?? []));
        const productContext = `${product.description} ${product.audience ?? ""} ${discoveryProfileContext(product.discoveryProfile)}`;
        const hackerNewsCalibration = this.discovery.feedbackCalibration(
          product.id,
          "hackernews",
        );
        const redditCalibration = this.discovery.feedbackCalibration(
          product.id,
          "reddit",
        );
        const hackerNewsMemory = this.discovery.recentQueryMemory(
          product.id,
          "hackernews",
        );
        const redditMemory = this.discovery.recentQueryMemory(
          product.id,
          "reddit",
        );
        const historicalBackfill = mode === "deep";
        let hypotheses: Array<{
          query: string;
          kind: string;
          platform: "reddit" | "hackernews" | "both";
        }> = [];
        if (this.classifier?.planQueries) {
          try {
            hypotheses = (
              await this.classifier.planQueries({
                productName: product.name,
                productDescription: product.description,
                productAudience: product.audience,
                productDiscoveryProfile: product.discoveryProfile,
                listeningPhrases: include,
                recentQueries: [...hackerNewsMemory, ...redditMemory]
                  .sort(
                    (left, right) =>
                      Date.parse(right.lastUsedAt) -
                      Date.parse(left.lastUsedAt),
                  )
                  .slice(0, 30)
                  .map((entry) => ({
                    query: entry.query,
                    qualified: entry.candidatesQualified,
                    reviewed: entry.candidatesReviewed,
                  })),
              })
            ).map(({ query, kind, platform }) => ({
              query,
              kind,
              platform: platform ?? "both",
            }));
          } catch {
            // Query planning is additive. A provider formatting failure falls
            // back to the deterministic phrase plan instead of failing a scan.
          }
        }
        const baseQueries = planSearchQueries(include, 25);
        const outcomeAnchors = planOutcomeAnchorQueries(productContext);
        const highIntent = (query: string) =>
          /\b(how|where|why|first|no|without|hard|need|help|struggl\w*|fail\w*|stuck|wast\w*|problem|pain|faster|recommend\w*|alternative\w*|validate|traction|adopter)\b|can(?:not|'t)|takes? too long/i.test(
            query,
          );
        const roundRobin = (groups: string[][]) => {
          const mixed: string[] = [];
          const length = Math.max(0, ...groups.map((group) => group.length));
          for (let index = 0; index < length; index += 1) {
            for (const group of groups)
              if (group[index]) mixed.push(group[index]!);
          }
          return mixed;
        };
        const redditHypotheses = hypotheses.filter(
          ({ query, platform }) =>
            platform !== "hackernews" ||
            (!/^\s*(ask|show)\s+hn\b/i.test(query) && highIntent(query)),
        );
        const queriesForKind = (
          values: typeof redditHypotheses,
          kind: string,
        ) =>
          values
            .filter((value) => value.kind === kind)
            .map(({ query }) => query);
        const directBaseQueries = planSearchQueries(
          product.phrases
            .filter(
              (phrase) =>
                phrase.isActive &&
                (phrase.kind === "alternative" || phrase.kind === "category"),
            )
            .map((phrase) => phrase.normalizedPhrase),
          8,
        );
        const painBaseQueries = planSearchQueries(
          product.phrases
            .filter(
              (phrase) =>
                phrase.isActive &&
                ["problem", "question", "audience"].includes(phrase.kind),
            )
            .map((phrase) => phrase.normalizedPhrase),
          8,
        );
        const redditExploration = roundRobin([
          outcomeAnchors,
          directBaseQueries,
          painBaseQueries,
          queriesForKind(redditHypotheses, "buying"),
          queriesForKind(redditHypotheses, "alternative"),
          queriesForKind(redditHypotheses, "pain"),
          queriesForKind(redditHypotheses, "help"),
          queriesForKind(redditHypotheses, "workflow"),
          queriesForKind(redditHypotheses, "audience"),
        ]);
        const redditPlanned = Boolean(
          this.redditEnabled &&
          this.redditSource &&
          this.discovery.redditVerifiedAccount() &&
          !this.discovery.isRedditHalted(),
        );
        const hackerNewsQueries = selectAdaptiveQueries(
          baseQueries,
          roundRobin(
            [
              "buying",
              "alternative",
              "pain",
              "help",
              "workflow",
              "audience",
            ].map((kind) =>
              hypotheses
                .filter(
                  (hypothesis) =>
                    hypothesis.platform !== "reddit" &&
                    hypothesis.kind === kind,
                )
                .map(({ query }) => query),
            ),
          ),
          hackerNewsMemory,
          Math.min(redditPlanned ? 5 : 12, Math.floor((60 - plannedTotal) / 2)),
        );
        const redditQueries = selectAdaptiveQueries(
          baseQueries,
          redditExploration,
          redditMemory,
          10,
        );
        for (const query of [
          ...hackerNewsQueries,
          ...(redditPlanned ? redditQueries : []),
        ]) {
          if (query.strategy === "explore") queriesExplored += 1;
          else queriesReused += 1;
        }
        plannedTotal +=
          hackerNewsQueries.length * 2 +
          (redditPlanned ? redditQueries.length : 0);
        this.discovery.updateScan(scanId, {
          queries_total: plannedTotal,
          queries_explored: queriesExplored,
          queries_reused: queriesReused,
          plan_summary: `Adaptive ${historicalBackfill ? "90-day deep" : "30-day current"} plan: ${queriesExplored} new hypotheses and ${queriesReused} memory-guided searches.`,
        });
        if (
          this.redditEnabled &&
          this.redditSource &&
          this.discovery.redditVerifiedAccount() &&
          !this.discovery.isRedditHalted()
        ) {
          try {
            const reddit = await this.redditSource.fetch(
              redditQueries.map(({ query }) => query),
              controller.signal,
              (message) =>
                this.discovery.updateScan(scanId, {
                  current_message: message,
                }),
              { days: historicalBackfill ? 90 : 30 },
            );
            fetched += reddit.items.length;
            redditFetched += reddit.items.length;
            completed += redditQueries.length;
            let redditQueryReviewed = 0;
            let redditQueryQualified = 0;
            const redditQueryCounts = new Map<
              string,
              { items: number; reviewed: number; qualified: number }
            >();
            const redditHasAttribution = reddit.items.some(
              (item) =>
                Array.isArray(item.metadata?.discovery_queries) &&
                item.metadata.discovery_queries.length > 0,
            );
            for (const plannedQuery of redditQueries)
              redditQueryCounts.set(plannedQuery.query, {
                items: reddit.items.filter((item) =>
                  Array.isArray(item.metadata?.discovery_queries)
                    ? item.metadata.discovery_queries.includes(
                        plannedQuery.query,
                      )
                    : false,
                ).length,
                reviewed: 0,
                qualified: 0,
              });
            for (const { item, matches, sourceQuery } of discoveryCandidates(
              reddit.items,
              include,
              exclude,
              productContext,
              redditQueries[0]?.query ?? "",
              18,
              threadCounts,
              redditCalibration,
            )) {
              const decision = await this.saveIfQualified(
                scanId,
                product,
                item,
                matches,
                sourceQuery,
                classifiedItems,
              );
              if (decision.status === "duplicate") continue;
              redditQueryReviewed += 1;
              const sourceStats = redditQueryCounts.get(sourceQuery);
              if (sourceStats) sourceStats.reviewed += 1;
              matched += 1;
              redditMatched += 1;
              if (decision.status === "rejected") {
                rejected += 1;
                redditRejected += 1;
                if (decision.tier === "market_signal") marketSignals += 1;
              } else {
                qualified += 1;
                redditQualified += 1;
                redditQueryQualified += 1;
                if (sourceStats) sourceStats.qualified += 1;
                if (decision.tier === "direct_opportunity") direct += 1;
                else helpful += 1;
                if (decision.status === "qualified-new") found += 1;
              }
            }
            redditQueries.forEach((plannedQuery, index) =>
              this.discovery.recordQueryRun({
                scanId,
                productId: product.id,
                platform: "reddit",
                query: plannedQuery.query,
                strategy: plannedQuery.strategy,
                itemsFetched:
                  !redditHasAttribution && index === 0
                    ? reddit.items.length
                    : (redditQueryCounts.get(plannedQuery.query)?.items ?? 0),
                candidatesReviewed:
                  !redditHasAttribution && index === 0
                    ? redditQueryReviewed
                    : (redditQueryCounts.get(plannedQuery.query)?.reviewed ??
                      0),
                candidatesQualified:
                  !redditHasAttribution && index === 0
                    ? redditQueryQualified
                    : (redditQueryCounts.get(plannedQuery.query)?.qualified ??
                      0),
              }),
            );
            this.discovery.updateScan(scanId, {
              items_fetched: fetched,
              reddit_items_fetched: redditFetched,
              hackernews_items_fetched: hackerNewsFetched,
              candidates_matched: matched,
              candidates_rejected: rejected,
              candidates_qualified: qualified,
              candidates_direct: direct,
              candidates_helpful: helpful,
              candidates_market_signals: marketSignals,
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
        for (const plannedQuery of hackerNewsQueries)
          for (const tag of ["story", "comment"] as const) {
            if (
              controller.signal.aborted ||
              this.discovery.isCancelRequested(scanId)
            )
              throw new DOMException("Cancelled", "AbortError");
            this.discovery.updateScan(scanId, {
              current_message: `Searching ${tag === "story" ? "posts" : "comments"} for “${plannedQuery.query}”...`,
            });
            const cutoff =
              Math.floor(Date.now() / 1000) -
              (historicalBackfill ? 90 : 30) * 86400;
            const parameters = new URLSearchParams({
              query: plannedQuery.query,
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
            let queryReviewed = 0;
            let queryQualified = 0;
            for (const { item, matches, sourceQuery } of discoveryCandidates(
              items,
              include,
              exclude,
              productContext,
              plannedQuery.query,
              4,
              threadCounts,
              hackerNewsCalibration,
            )) {
              if (productHackerNewsReviewed >= 28) break;
              const decision = await this.saveIfQualified(
                scanId,
                product,
                item,
                matches,
                sourceQuery,
                classifiedItems,
              );
              if (decision.status === "duplicate") continue;
              queryReviewed += 1;
              productHackerNewsReviewed += 1;
              matched += 1;
              hackerNewsMatched += 1;
              if (decision.status === "rejected") {
                rejected += 1;
                hackerNewsRejected += 1;
                if (decision.tier === "market_signal") marketSignals += 1;
              } else {
                qualified += 1;
                hackerNewsQualified += 1;
                queryQualified += 1;
                if (decision.tier === "direct_opportunity") direct += 1;
                else helpful += 1;
                if (decision.status === "qualified-new") found += 1;
              }
            }
            this.discovery.recordQueryRun({
              scanId,
              productId: product.id,
              platform: "hackernews",
              query: plannedQuery.query,
              strategy: plannedQuery.strategy,
              itemsFetched: items.length,
              candidatesReviewed: queryReviewed,
              candidatesQualified: queryQualified,
            });
            completed += 1;
            this.discovery.updateScan(scanId, {
              queries_completed: completed,
              items_fetched: fetched,
              reddit_items_fetched: redditFetched,
              hackernews_items_fetched: hackerNewsFetched,
              candidates_matched: matched,
              candidates_rejected: rejected,
              candidates_qualified: qualified,
              candidates_direct: direct,
              candidates_helpful: helpful,
              candidates_market_signals: marketSignals,
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
          : completedMessage(
              fetched,
              matched,
              rejected,
              qualified,
              found,
              direct,
              helpful,
              marketSignals,
            ),
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
