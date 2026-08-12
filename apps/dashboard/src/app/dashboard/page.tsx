"use client";

import type {
  CreateProductInput,
  OpportunityFeedItem,
  Product,
  UpdateProductInput,
  UsageSummary,
  AnalyticsSummary,
} from "@mentionish/types";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ProductApiError,
  createProduct,
  deleteProduct,
  listArchivedProducts,
  listProducts,
  parseKeywordInput,
  restoreProduct,
  updateProduct,
} from "../../lib/products-api";
import { createBrowserSupabaseClient } from "../../lib/supabase";
import {
  getDraftOperation,
  listOpportunities,
  requestDraft,
  saveDraftText,
  markOpportunityPosted,
  skipOpportunity,
} from "../../lib/opportunities-api";
import { getAnalytics, getUsage } from "../../lib/workspace-api";
import { getLocalInstallationToken, isLocalRuntime } from "../../lib/runtime";
import { suggestPhrases, type PhraseSuggestion } from "../../lib/ai-api";
import { AiSettingsPanel } from "../../components/ai-settings";
import { RedditSettingsPanel } from "../../components/reddit-settings";
import {
  startScan,
  getScan,
  listScans,
  cancelScan,
  listScanCandidates,
  type ScanCandidateAudit,
  type ScanRun,
} from "../../lib/scans-api";

interface ProductFormState {
  name: string;
  description: string;
  audience: string;
  keywords: string;
  voicePersona: string;
}

const emptyForm: ProductFormState = {
  name: "",
  description: "",
  audience: "",
  keywords: "",
  voicePersona: "",
};

function formFromProduct(product: Product): ProductFormState {
  return {
    name: product.name,
    description: product.description,
    audience: product.audience ?? "",
    keywords: product.keywords.join("\n"),
    voicePersona: product.voice_persona ?? "",
  };
}

function messageFor(error: unknown): string {
  if (error instanceof ProductApiError) {
    if (error.code === "PRODUCT_LIMIT_REACHED") {
      return "Your current plan has reached its active product limit. Edit or remove an existing product before adding another.";
    }
    if (error.code === "KEYWORD_LIMIT_REACHED") {
      return "This product has more keywords than your plan allows. Remove a few and try again.";
    }
    if (error.status === 401) {
      return isLocalRuntime()
        ? "The local API authorization expired. Reload Mentionish to reconnect."
        : "Your session expired. Sign in again to continue.";
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "We could not complete that request. Please try again.";
}

function initials(email: string | null): string {
  return (email?.trim().charAt(0) || "M").toUpperCase();
}

function qualificationLabel(
  label: "rejected" | "worth_helping" | "potential_buyer" | null | undefined,
): string {
  if (label === "potential_buyer") return "Best opportunity";
  if (label === "worth_helping") return "Possible match";
  return "Rejected";
}

function DraftEditor({
  accessToken,
  item,
  onSaved,
}: {
  accessToken: string;
  item: OpportunityFeedItem;
  onSaved: () => void;
}) {
  const draft = item.draft;
  const [text, setText] = useState(draft?.edited_text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(draft?.edited_text ?? ""), [draft?.edited_text]);
  if (!draft) return null;
  const activeDraft = draft;
  const changed = text.trim() !== activeDraft.edited_text;
  async function save() {
    if (!changed || !text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveDraftText(
        accessToken,
        activeDraft.id,
        text,
        activeDraft.version,
      );
      onSaved();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="draft-editor">
      <div className="draft-heading">
        <strong>Editable reply draft</strong>
        <span>Review before manually posting</span>
      </div>
      <textarea
        value={text}
        maxLength={3000}
        rows={7}
        onChange={(event) => setText(event.target.value)}
        aria-label="Editable reply draft"
      />
      <div className="draft-footer">
        <span>{text.length}/3000</span>
        <button
          className="secondary-action small-action"
          type="button"
          disabled={!changed || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : "Save edit"}
        </button>
      </div>
      {error ? (
        <p className="inline-card-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
function OpportunitiesPanel({
  accessToken,
  products,
  usage,
  onUsageRefresh,
}: {
  accessToken: string | null;
  products: Product[];
  usage: UsageSummary | null;
  onUsageRefresh: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [platform, setPlatform] = useState<"all" | "reddit" | "hackernews">(
    "all",
  );
  const [workflow, setWorkflow] = useState<"active" | "replied" | "skipped">(
    "active",
  );
  const [items, setItems] = useState<OpportunityFeedItem[]>([]);
  const [otherMatches, setOtherMatches] = useState<ScanCandidateAudit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!productId && products[0]) setProductId(products[0].id);
  }, [productId, products]);

  async function loadFeed(cursor?: string, append = false) {
    if (!accessToken || !productId) return;
    setFeedLoading(true);
    setFeedError(null);
    try {
      const page = await listOpportunities(accessToken, productId, {
        status:
          workflow === "active"
            ? ["new", "drafted"]
            : workflow === "replied"
              ? ["posted"]
              : ["skipped"],
        minScore: isLocalRuntime() ? 0 : 60,
        ...(platform === "all" ? {} : { platform }),
        ...(cursor ? { cursor } : {}),
      });
      setItems((current) =>
        append ? [...current, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
      if (!cursor) {
        const scans = await listScans(accessToken);
        const latest = scans.find(
          (scan) =>
            scan.status === "succeeded" && scan.product_ids.includes(productId),
        );
        const candidates = latest
          ? await listScanCandidates(accessToken, latest.id)
          : [];
        setOtherMatches(
          workflow === "active"
            ? candidates.filter(
                (candidate) =>
                  candidate.product_id === productId &&
                  candidate.decision === "rejected" &&
                  (platform === "all" || candidate.platform === platform),
              )
            : [],
        );
      }
    } catch (error) {
      setFeedError(messageFor(error));
    } finally {
      setFeedLoading(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, [accessToken, productId, platform, workflow]);

  async function generate(item: OpportunityFeedItem) {
    if (!accessToken) return;
    setWorkingId(item.id);
    setFeedError(null);
    try {
      const { operationId } = await requestDraft(
        accessToken,
        item.id,
        item.draft !== null,
      );
      for (let attempt = 0; attempt < 45; attempt += 1) {
        const operation = await getDraftOperation(accessToken, operationId);
        if (operation.status === "succeeded") {
          await loadFeed();
          onUsageRefresh();
          return;
        }
        if (operation.status === "failed")
          throw new Error(
            "Draft generation failed. Your quota reservation was released; you can try again.",
          );
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      throw new Error(
        "Draft generation is still running. Refresh the feed in a moment.",
      );
    } catch (error) {
      setFeedError(messageFor(error));
    } finally {
      setWorkingId(null);
    }
  }
  async function copyDraft(item: OpportunityFeedItem) {
    const text = item.draft?.edited_text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFeedError(null);
    } catch {
      setFeedError(
        "The draft could not be copied. Select the draft text and copy it manually.",
      );
    }
  }

  async function changeStatus(
    item: OpportunityFeedItem,
    action: "skip" | "posted",
  ) {
    if (!accessToken) return;
    setWorkingId(item.id);
    setFeedError(null);
    try {
      if (action === "skip") await skipOpportunity(accessToken, item.id);
      else await markOpportunityPosted(accessToken, item.id);
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
    } catch (error) {
      setFeedError(messageFor(error));
    } finally {
      setWorkingId(null);
    }
  }

  if (products.length === 0) {
    return (
      <section className="products-panel dashboard-empty">
        <span className="empty-icon" aria-hidden="true">
          O
        </span>
        <h3>Add a product before searching conversations</h3>
        <p>
          Your product and listening phrases determine which public
          conversations appear here.
        </p>
      </section>
    );
  }

  const bestItems = items.filter(
    (item) => item.qualification_label === "potential_buyer",
  );
  const possibleItems = items.filter(
    (item) => item.qualification_label !== "potential_buyer",
  );
  const orderedItems = [...bestItems, ...possibleItems];
  const visibleKeys = new Set(
    orderedItems.map(
      (item) =>
        `${item.post.author?.trim().toLocaleLowerCase() ?? ""}|${item.post.title.trim().toLocaleLowerCase()}`,
    ),
  );
  const seenOther = new Set<string>();
  const uniqueOtherMatches = otherMatches.filter((candidate) => {
    const key = `${candidate.author?.trim().toLocaleLowerCase() ?? ""}|${candidate.title.trim().toLocaleLowerCase()}`;
    if (visibleKeys.has(key) || seenOther.has(key)) return false;
    seenOther.add(key);
    return true;
  });

  return (
    <section
      className="opportunity-workspace"
      aria-labelledby="opportunities-title"
    >
      <div className="feed-toolbar">
        <div>
          <p className="page-kicker">Discovery results</p>
          <h2 id="opportunities-title">Conversations ranked for review</h2>
          <p>
            Review the source before replying. Mentionish never posts for you.
          </p>
        </div>
        <div className="feed-filters">
          <label>
            Product
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select
              value={platform}
              onChange={(event) =>
                setPlatform(event.target.value as typeof platform)
              }
            >
              <option value="all">All sources</option>
              <option value="hackernews">Hacker News</option>
              <option value="reddit">Reddit</option>
            </select>
          </label>
        </div>
      </div>

      <div className="workflow-tabs" aria-label="Conversation status">
        {(["active", "replied", "skipped"] as const).map((value) => (
          <button
            key={value}
            className={
              workflow === value
                ? "workflow-tab workflow-tab-active"
                : "workflow-tab"
            }
            type="button"
            aria-pressed={workflow === value}
            onClick={() => setWorkflow(value)}
          >
            {value === "active"
              ? "Active"
              : value === "replied"
                ? "Replied"
                : "Skipped"}
          </button>
        ))}
      </div>
      {feedError ? (
        <p className="notice-banner notice-error" role="alert">
          {feedError}
        </p>
      ) : null}
      {feedLoading && items.length === 0 ? (
        <div className="feed-state">Loading discovery results...</div>
      ) : null}
      {!feedLoading &&
      items.length === 0 &&
      otherMatches.length === 0 &&
      !feedError ? (
        <div className="feed-state">
          <strong>No keyword-matched conversations yet</strong>
          <p>
            Reddit discovery is active through the supervised browser bridge.
            Hacker News continues as the fallback source.
          </p>
        </div>
      ) : null}
      <div className="opportunity-list">
        {orderedItems.map((item, index) => (
          <Fragment key={item.id}>
            {index === 0 && bestItems.length > 0 ? (
              <div className="opportunity-tier-heading">
                <div>
                  <strong>Best opportunities</strong>
                  <span>Strong problem fit with clear solution interest</span>
                </div>
                <span>{bestItems.length}</span>
              </div>
            ) : null}
            {index === bestItems.length && possibleItems.length > 0 ? (
              <div className="opportunity-tier-heading opportunity-tier-possible">
                <div>
                  <strong>Possible matches</strong>
                  <span>Relevant conversations worth reviewing manually</span>
                </div>
                <span>{possibleItems.length}</span>
              </div>
            ) : null}
            <article className="opportunity-card" key={item.id}>
              <div className="opportunity-meta">
                <span
                  className={`platform-badge platform-${item.post.platform}`}
                >
                  {item.post.platform === "reddit"
                    ? `Reddit${item.post.subreddit ? ` / r/${item.post.subreddit}` : ""}`
                    : "Hacker News"}
                </span>
                <span>
                  {item.post.author
                    ? `by ${item.post.author}`
                    : "Author unavailable"}
                </span>
                <time dateTime={item.post.source_created_at ?? item.created_at}>
                  {new Date(
                    item.post.source_created_at ?? item.created_at,
                  ).toLocaleDateString()}
                </time>
              </div>
              <h3>{item.post.title || "Untitled conversation"}</h3>
              <p className="opportunity-excerpt">
                {item.post.body || "Open the source to read the conversation."}
              </p>
              <div className="intent-box">
                <strong>
                  {qualificationLabel(
                    item.qualification_label ?? "worth_helping",
                  )}
                  {item.intent_score == null
                    ? ""
                    : ` · ${item.intent_score}% overall fit`}
                </strong>
                {item.buying_intent != null ? (
                  <span>
                    Problem fit {item.problem_fit}% · Solution seeking{" "}
                    {item.solution_seeking}% · Buying intent{" "}
                    {item.buying_intent}%
                  </span>
                ) : null}
                <span>{item.reasoning}</span>
              </div>{" "}
              <DraftEditor
                accessToken={accessToken ?? ""}
                item={item}
                onSaved={() => void loadFeed()}
              />
              <div className="opportunity-actions">
                <button
                  className="primary-action"
                  type="button"
                  disabled={
                    workflow !== "active" ||
                    workingId === item.id ||
                    usage?.draft.remaining === 0
                  }
                  title={
                    usage?.draft.remaining === 0
                      ? "Draft quota exhausted"
                      : undefined
                  }
                  onClick={() => void generate(item)}
                >
                  {workingId === item.id
                    ? "Generating..."
                    : item.draft
                      ? "Regenerate draft"
                      : "Generate draft"}
                </button>
                <a
                  className="primary-action"
                  href={item.post.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source
                </a>
                {item.post.platform === "hackernews" && item.draft ? (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => void copyDraft(item)}
                  >
                    Copy draft
                  </button>
                ) : null}
                <button
                  className="secondary-action"
                  type="button"
                  disabled={workflow !== "active" || workingId === item.id}
                  onClick={() => void changeStatus(item, "posted")}
                >
                  Mark replied
                </button>
                <button
                  className="text-danger"
                  type="button"
                  disabled={workflow !== "active" || workingId === item.id}
                  onClick={() => void changeStatus(item, "skip")}
                >
                  Skip
                </button>
              </div>
            </article>
          </Fragment>
        ))}
        {uniqueOtherMatches.length > 0 ? (
          <div className="opportunity-tier-heading opportunity-tier-other">
            <div>
              <strong>Other keyword matches</strong>
              <span>
                Matched your phrases but ranked lower by AI. Review manually.
              </span>
            </div>
            <span>{uniqueOtherMatches.length}</span>
          </div>
        ) : null}
        {uniqueOtherMatches.map((candidate) => (
          <article
            className="opportunity-card opportunity-card-low-confidence"
            key={candidate.id}
          >
            <div className="opportunity-meta">
              <span className={`platform-badge platform-${candidate.platform}`}>
                {candidate.platform === "reddit"
                  ? `Reddit${candidate.subreddit ? ` / r/${candidate.subreddit}` : ""}`
                  : "Hacker News"}
              </span>
              <span>
                {candidate.item_type === "comment" ? "Comment" : "Post"}
              </span>
              <span>{candidate.intent_score}% ranked fit</span>
            </div>
            <h3>
              {candidate.title ||
                candidate.body.slice(0, 120) ||
                "Untitled conversation"}
            </h3>
            <p className="opportunity-excerpt">
              {candidate.body || "Open the source to read the conversation."}
            </p>
            <div className="intent-box intent-box-low-confidence">
              <strong>Keyword match · Not recommended by AI</strong>
              <span>
                Problem fit {candidate.problem_fit ?? 0}% · Solution seeking{" "}
                {candidate.solution_seeking ?? 0}% · Buying intent{" "}
                {candidate.buying_intent ?? 0}%
              </span>
              <span>{candidate.reasoning}</span>
              <span>
                Matched:{" "}
                {candidate.matched_phrases.join(", ") ||
                  "Phrase evidence unavailable"}
              </span>
            </div>
            <div className="opportunity-actions">
              <a
                className="secondary-action"
                href={candidate.url}
                target="_blank"
                rel="noreferrer"
              >
                Open source
              </a>
            </div>
          </article>
        ))}
      </div>
      {nextCursor ? (
        <button
          className="secondary-action load-more"
          type="button"
          disabled={feedLoading}
          onClick={() => void loadFeed(nextCursor, true)}
        >
          {feedLoading ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </section>
  );
}

function QuotaMeter({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used: number;
  limit: number;
  remaining: number;
}) {
  return (
    <div className="quota-meter">
      <div>
        <strong>{label}</strong>
        <span>{remaining} remaining</span>
      </div>
      <progress
        value={used}
        max={Math.max(limit, 1)}
        aria-label={label + ": " + used + " of " + limit + " used"}
      />
      <small>
        {used} of {limit} used
      </small>
    </div>
  );
}

function OverviewPanel({
  usage,
  products,
  onNavigate,
  localRuntime,
}: {
  usage: UsageSummary | null;
  products: Product[];
  onNavigate: (view: "products" | "opportunities" | "analytics") => void;
  localRuntime: boolean;
}) {
  if (localRuntime) {
    return (
      <section className="overview-workspace" aria-labelledby="overview-title">
        <div className="overview-hero">
          <div>
            <p className="page-kicker">Local workspace</p>
            <h2 id="overview-title">Your data stays on this device</h2>
            <p>
              Add products, review phrases, and start discovery manually. No
              Mentionish account, plan, or hosted database is involved.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={() => onNavigate("products")}
          >
            Manage products
          </button>
        </div>
        <div className="metrics-grid">
          <article className="metric-card">
            <span>Runtime</span>
            <strong className="metric-word">Local</strong>
            <p>Loopback API only</p>
          </article>
          <article className="metric-card">
            <span>Active products</span>
            <strong>{products.length}</strong>
            <p>No plan-derived product limit</p>
          </article>
          <article className="metric-card">
            <span>Database</span>
            <strong className="metric-word">SQLite</strong>
            <p>Stored in your application-data folder</p>
          </article>
        </div>
      </section>
    );
  }
  if (!usage)
    return (
      <section className="feed-state" aria-busy="true">
        Loading plan usage...
      </section>
    );
  return (
    <section className="overview-workspace" aria-labelledby="overview-title">
      <div className="overview-hero">
        <div>
          <p className="page-kicker">Today at a glance</p>
          <h2 id="overview-title">Your listening workspace is live</h2>
          <p>
            Reddit is the primary discovery source. Every reply remains reviewed
            and manually posted by you.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => onNavigate("opportunities")}
        >
          Review conversations
        </button>
      </div>
      <div className="metrics-grid">
        <article className="metric-card">
          <span>Plan</span>
          <strong className="metric-word">{usage.plan}</strong>
          <p>Server-verified entitlement</p>
        </article>
        <article className="metric-card">
          <span>Active products</span>
          <strong>
            {usage.products.active}/{usage.products.limit}
          </strong>
          <p>{products.length} configured in this workspace</p>
        </article>
        <article className="metric-card">
          <span>Drafts available</span>
          <strong>{usage.draft.remaining}</strong>
          <p>Generate only when you request one</p>
        </article>
      </div>
      <section className="usage-panel" aria-labelledby="usage-title">
        <div className="panel-heading">
          <div>
            <h2 id="usage-title">Usage</h2>
            <p>Authoritative totals from your current plan period.</p>
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={() => onNavigate("analytics")}
          >
            View analytics
          </button>
        </div>
        <div className="quota-grid">
          <QuotaMeter
            label="Conversation classifications"
            {...usage.classification}
          />
          <QuotaMeter label="AI reply drafts" {...usage.draft} />
        </div>
        {usage.classification.remaining === 0 ? (
          <p className="quota-warning" role="status">
            Your classification allowance is used. Existing conversations and
            drafts remain available.
          </p>
        ) : null}
        {usage.draft.remaining === 0 ? (
          <p className="quota-warning" role="status">
            Your draft allowance is used. You can still edit, copy, open, skip,
            and mark existing conversations replied.
          </p>
        ) : null}
      </section>
    </section>
  );
}

function AnalyticsPanel({
  accessToken,
  products,
}: {
  accessToken: string | null;
  products: Product[];
}) {
  const [windowValue, setWindowValue] = useState<"7d" | "30d">("7d");
  const [productId, setProductId] = useState("");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setAnalyticsLoading(true);
    setError(null);
    getAnalytics(accessToken, {
      ...(productId ? { productId } : {}),
      window: windowValue,
    })
      .then((summary) => {
        if (active) setData(summary);
      })
      .catch((caught) => {
        if (active) setError(messageFor(caught));
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, productId, windowValue]);

  return (
    <section className="analytics-workspace" aria-labelledby="analytics-title">
      <div className="feed-toolbar">
        <div>
          <p className="page-kicker">Manual reply funnel</p>
          <h2 id="analytics-title">Conversation analytics</h2>
          <p>
            Posting is self-reported. Mentionish does not track platform
            engagement.
          </p>
        </div>
        <div className="feed-filters">
          <label>
            Product
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Window
            <select
              value={windowValue}
              onChange={(event) =>
                setWindowValue(event.target.value as "7d" | "30d")
              }
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>
      </div>
      {error ? (
        <p className="notice-banner notice-error" role="alert">
          {error}
        </p>
      ) : null}
      {analyticsLoading ? (
        <div className="feed-state" aria-busy="true">
          Loading analytics...
        </div>
      ) : null}
      {!analyticsLoading && data ? (
        <>
          <div
            className="analytics-grid"
            aria-label={data.window_days + "-day funnel"}
          >
            <article>
              <span>Qualified</span>
              <strong>{data.qualified}</strong>
              <p>Worth reviewing</p>
            </article>
            <article>
              <span>Drafted</span>
              <strong>{data.drafted}</strong>
              <p>Distinct conversations</p>
            </article>
            <article>
              <span>Replied</span>
              <strong>{data.posted}</strong>
              <p>Marked by you</p>
            </article>
            <article>
              <span>Draft to reply</span>
              <strong>{data.draft_to_post_percent}%</strong>
              <p>Self-reported conversion</p>
            </article>
          </div>
          <section className="source-breakdown">
            <div>
              <h3>Qualified by source</h3>
              <p>Latest {data.window_days} days</p>
            </div>
            <div className="source-stat">
              <span>Reddit</span>
              <strong>{data.platforms.reddit ?? 0}</strong>
            </div>
            <div className="source-stat">
              <span>Hacker News</span>
              <strong>{data.platforms.hackernews ?? 0}</strong>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
export default function DashboardPage() {
  const router = useRouter();
  const localRuntime = isLocalRuntime();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<
    "overview" | "products" | "opportunities" | "analytics" | "settings"
  >(localRuntime ? "products" : "opportunities");
  const [email, setEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [saveReady, setSaveReady] = useState(false);
  const setupModalRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<
    "save" | "delete" | "restore" | "reload" | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phraseSuggestions, setPhraseSuggestions] = useState<
    PhraseSuggestion[]
  >([]);
  const [suggesting, setSuggesting] = useState(false);
  const [activeScan, setActiveScan] = useState<ScanRun | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ScanCandidateAudit[]>(
    [],
  );
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadWithToken(token: string, ownerLabel: string) {
      if (!active) return;
      setAccessToken(token);
      setEmail(ownerLabel);
      try {
        const [loadedProducts, loadedArchivedProducts, loadedUsage] =
          await Promise.all([
            listProducts(token),
            listArchivedProducts(token),
            getUsage(token),
          ]);
        if (!active) return;
        setProducts(loadedProducts);
        setArchivedProducts(loadedArchivedProducts);
        setUsage(loadedUsage);
        setFormOpen(
          loadedProducts.length === 0 && loadedArchivedProducts.length === 0,
        );
      } catch (caught) {
        if (active) setLoadError(messageFor(caught));
      } finally {
        if (active) setLoading(false);
      }
    }

    if (localRuntime) {
      void getLocalInstallationToken()
        .then((token) => loadWithToken(token, "Local workspace"))
        .catch((caught: unknown) => {
          if (active) {
            setLoadError(messageFor(caught));
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }

    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/");
        return;
      }
      return loadWithToken(
        session.access_token,
        session.user.email ?? "your account",
      );
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          router.replace("/");
          return;
        }
        setAccessToken(session.access_token);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [localRuntime, router]);

  const keywords = parseKeywordInput(form.keywords);
  const keywordCount = products.reduce(
    (total, product) => total + product.keywords.length,
    0,
  );

  useEffect(() => {
    if (!formOpen) return;
    setupModalRef.current?.scrollTo({ top: 0, behavior: "auto" });

    if (step !== 3) {
      setSaveReady(false);
      return;
    }

    const timer = window.setTimeout(() => setSaveReady(true), 400);
    return () => window.clearTimeout(timer);
  }, [formOpen, step]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setStep(1);
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm(formFromProduct(product));
    setStep(1);
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (pending === "save") return;
    setFormOpen(false);
    setFormError(null);
  }

  function validateStep(currentStep: number): string | null {
    if (currentStep === 1) {
      if (!form.name.trim()) return "Enter a product name.";
      if (!form.description.trim()) {
        return "Describe the problem your product solves.";
      }
    }
    if (currentStep === 2) {
      if (keywords.length === 0) return "Add at least one listening phrase.";
      if (new Set(keywords).size !== keywords.length) {
        return "Remove duplicate listening phrases before continuing.";
      }
      if (keywords.some((keyword) => keyword.length < 2)) {
        return "Each listening phrase must contain at least two characters.";
      }
      if (keywords.some((keyword) => keyword.length > 80)) {
        return "Each listening phrase must be 80 characters or fewer.";
      }
      if (keywords.length > 25) {
        return "Use no more than 25 listening phrases.";
      }
    }
    return null;
  }

  function continueForm() {
    const validationError = validateStep(step);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setStep((current) => Math.min(3, current + 1));
  }

  async function generatePhraseSuggestions() {
    if (!accessToken) return;
    const firstStepError = validateStep(1);
    if (firstStepError) {
      setFormError(firstStepError);
      return;
    }
    setSuggesting(true);
    setFormError(null);
    try {
      const result = await suggestPhrases(accessToken, {
        name: form.name.trim(),
        description: form.description.trim(),
        audience: form.audience.trim() || null,
      });
      setPhraseSuggestions(result.suggestions);
      setNotice(
        `Generated with ${result.provider} ${result.model} using ${result.usage.totalTokens} tokens. Review before adding.`,
      );
    } catch (caught) {
      setFormError(messageFor(caught));
    } finally {
      setSuggesting(false);
    }
  }

  function addSuggestedPhrase(suggestion: PhraseSuggestion) {
    const existing = parseKeywordInput(form.keywords);
    if (existing.includes(suggestion.phrase.toLowerCase())) return;
    setForm({ ...form, keywords: [...existing, suggestion.phrase].join("\n") });
  }

  function useRecommendedPhraseSet() {
    const recommended = parseKeywordInput(
      phraseSuggestions.map(({ phrase }) => phrase).join("\n"),
    ).slice(0, 25);
    setForm({ ...form, keywords: recommended.join("\n") });
    setNotice(
      `Loaded ${recommended.length} balanced recommendations into the editor. Review them before saving.`,
    );
  }
  async function submitProductForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      continueForm();
      return;
    }
    if (!accessToken || !saveReady) return;

    const validationError = validateStep(1) ?? validateStep(2);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const input: CreateProductInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      audience: form.audience.trim() || null,
      keywords,
      voice_persona: form.voicePersona.trim() || null,
    };

    setPending("save");
    setFormError(null);
    setNotice(null);
    try {
      if (editingId) {
        const update: UpdateProductInput = input;
        const saved = await updateProduct(accessToken, editingId, update);
        setProducts((current) =>
          current.map((product) => (product.id === saved.id ? saved : product)),
        );
        setNotice(saved.name + " was updated.");
      } else {
        const saved = await createProduct(accessToken, input);
        setProducts((current) => [...current, saved]);
        setNotice(saved.name + " is ready for discovery.");
      }
      setFormOpen(false);
      void refreshUsage();
    } catch (caught) {
      setFormError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function reloadProducts() {
    if (!accessToken) return;
    setPending("reload");
    setLoadError(null);
    try {
      const [loadedProducts, loadedArchivedProducts] = await Promise.all([
        listProducts(accessToken),
        listArchivedProducts(accessToken),
      ]);
      setProducts(loadedProducts);
      setArchivedProducts(loadedArchivedProducts);
    } catch (caught) {
      setLoadError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function removeProduct(product: Product) {
    if (!accessToken) return;
    const confirmed = window.confirm(
      "Remove " +
        product.name +
        "? Discovery for it will stop, but existing records remain protected.",
    );
    if (!confirmed) return;

    setPending("delete");
    setLoadError(null);
    setNotice(null);
    try {
      await deleteProduct(accessToken, product.id);
      setProducts((current) =>
        current.filter((candidate) => candidate.id !== product.id),
      );
      setArchivedProducts((current) => [
        {
          ...product,
          is_active: false,
          deleted_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setNotice(product.name + " was archived. You can restore it below.");
      void refreshUsage();
    } catch (caught) {
      setLoadError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function restoreArchivedProduct(product: Product) {
    if (!accessToken) return;
    setPending("restore");
    setLoadError(null);
    setNotice(null);
    try {
      const restored = await restoreProduct(accessToken, product.id);
      setArchivedProducts((current) =>
        current.filter((candidate) => candidate.id !== restored.id),
      );
      setProducts((current) => [...current, restored]);
      setNotice(restored.name + " was restored and discovery is active again.");
      void refreshUsage();
    } catch (caught) {
      setLoadError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function refreshUsage() {
    if (!accessToken) return;
    try {
      setUsage(await getUsage(accessToken));
    } catch {
      // The next navigation or reload retries without interrupting the current workflow.
    }
  }
  async function beginScan(productId?: string) {
    if (!accessToken) return;
    setScanError(null);
    setAuditOpen(false);
    setScanCandidates([]);
    try {
      const started = await startScan(accessToken, productId);
      setActiveScan(await getScan(accessToken, started.scan_id));
    } catch (caught) {
      setScanError(messageFor(caught));
    }
  }
  async function reviewScanDecisions() {
    if (!accessToken || !activeScan) return;
    if (auditOpen) {
      setAuditOpen(false);
      return;
    }
    setAuditOpen(true);
    if (scanCandidates.length > 0) return;
    setAuditLoading(true);
    setScanError(null);
    try {
      setScanCandidates(await listScanCandidates(accessToken, activeScan.id));
    } catch (caught) {
      setScanError(messageFor(caught));
      setAuditOpen(false);
    } finally {
      setAuditLoading(false);
    }
  }
  async function stopScan() {
    if (!accessToken || !activeScan) return;
    try {
      setActiveScan(await cancelScan(accessToken, activeScan.id));
    } catch (caught) {
      setScanError(messageFor(caught));
    }
  }
  useEffect(() => {
    if (
      !accessToken ||
      !activeScan ||
      !["pending", "running", "cancelling"].includes(activeScan.status)
    )
      return;
    const timer = window.setInterval(() => {
      void getScan(accessToken, activeScan.id)
        .then((scan) => {
          setActiveScan(scan);
          if (scan.status === "succeeded") setNotice(scan.current_message);
        })
        .catch((caught) => setScanError(messageFor(caught)));
    }, 750);
    return () => window.clearInterval(timer);
  }, [accessToken, activeScan?.id, activeScan?.status]);
  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return (
      <main className="app-loading" aria-busy="true">
        <span className="loading-mark">M</span>
        <p>Preparing your workspace...</p>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">M</span>
          <span>Mentionish</span>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          <p className="nav-label">Workspace</p>
          <button
            className={
              workspaceView === "overview"
                ? "nav-item nav-item-active"
                : "nav-item"
            }
            type="button"
            onClick={() => setWorkspaceView("overview")}
          >
            <span className="nav-glyph" aria-hidden="true">
              O
            </span>
            Overview
          </button>
          <button
            className={`nav-item ${workspaceView === "products" ? "nav-item-active" : ""}`}
            type="button"
            onClick={() => setWorkspaceView("products")}
          >
            <span className="nav-glyph" aria-hidden="true">
              P
            </span>
            Products
          </button>
          <button
            className={`nav-item ${workspaceView === "opportunities" ? "nav-item-active" : ""}`}
            type="button"
            onClick={() => setWorkspaceView("opportunities")}
          >
            <span className="nav-glyph" aria-hidden="true">
              C
            </span>
            Conversations
          </button>
          <button
            className={
              workspaceView === "analytics"
                ? "nav-item nav-item-active"
                : "nav-item"
            }
            type="button"
            onClick={() => setWorkspaceView("analytics")}
          >
            <span className="nav-glyph" aria-hidden="true">
              A
            </span>
            Analytics
          </button>

          <p className="nav-label nav-label-spaced">
            {localRuntime ? "Local" : "Account"}
          </p>
          <button
            className={`nav-item ${workspaceView === "settings" ? "nav-item-active" : ""}`}
            type="button"
            onClick={() => setWorkspaceView("settings")}
          >
            <span className="nav-glyph" aria-hidden="true">
              S
            </span>
            Settings
          </button>
        </nav>

        <div className="source-health">
          <div className="source-health-heading">
            <span className="health-dot" />
            Discovery status
          </div>
          <p>Reddit is the primary source</p>
          <span>Hacker News fallback is ready</span>
        </div>

        <div className="sidebar-account">
          <span className="avatar">{initials(email)}</span>
          <div>
            <strong>{email}</strong>
            <span>
              {localRuntime
                ? "On this device"
                : usage
                  ? `${usage.plan} workspace`
                  : "Loading"}
            </span>
          </div>
          {!localRuntime ? (
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              Exit
            </button>
          ) : null}
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <p className="page-kicker">Workspace</p>
            <h1>
              {workspaceView === "overview"
                ? "Overview"
                : workspaceView === "products"
                  ? "Products"
                  : workspaceView === "analytics"
                    ? "Analytics"
                    : workspaceView === "settings"
                      ? "Settings"
                      : "Conversations"}
            </h1>
          </div>
          {workspaceView === "products" ? (
            <div className="topbar-actions">
              {localRuntime ? (
                <button
                  className="secondary-action"
                  type="button"
                  disabled={
                    Boolean(
                      activeScan &&
                      ["pending", "running", "cancelling"].includes(
                        activeScan.status,
                      ),
                    ) || products.length === 0
                  }
                  onClick={() => void beginScan()}
                >
                  Scan all
                </button>
              ) : null}
              <button
                className="primary-action"
                type="button"
                onClick={openCreate}
              >
                <span aria-hidden="true">+</span> New product
              </button>
            </div>
          ) : null}
        </header>

        <div className="app-content">
          {localRuntime && activeScan ? (
            <section
              className={`scan-banner scan-${activeScan.status}`}
              role="status"
            >
              <div>
                <strong>
                  {activeScan.status === "succeeded"
                    ? "Scan complete"
                    : activeScan.status === "failed"
                      ? "Scan failed"
                      : activeScan.status === "cancelled"
                        ? "Scan cancelled"
                        : "Discovery scan running"}
                </strong>
                <p>{activeScan.error_message ?? activeScan.current_message}</p>
              </div>
              <div className="scan-progress">
                <span>
                  {activeScan.queries_completed}/{activeScan.queries_total}{" "}
                  searches
                </span>
                <span title="Reddit and Hacker News source items">
                  {activeScan.items_fetched} reviewed (
                  {activeScan.reddit_items_fetched} Reddit ·{" "}
                  {activeScan.hackernews_items_fetched} HN)
                </span>
                <span>
                  {activeScan.candidates_matched} phrase matches (
                  {activeScan.reddit_candidates_matched} R ·{" "}
                  {activeScan.hackernews_candidates_matched} HN)
                </span>
                <span>
                  {activeScan.candidates_rejected} AI rejected (
                  {activeScan.reddit_candidates_rejected} R ·{" "}
                  {activeScan.hackernews_candidates_rejected} HN)
                </span>
                <span>
                  {activeScan.candidates_qualified} qualified (
                  {activeScan.reddit_candidates_qualified} R ·{" "}
                  {activeScan.hackernews_candidates_qualified} HN)
                </span>
                <span>{activeScan.opportunities_found} new</span>
                {["pending", "running", "cancelling"].includes(
                  activeScan.status,
                ) ? (
                  <button
                    className="secondary-action small-action"
                    type="button"
                    disabled={activeScan.status === "cancelling"}
                    onClick={() => void stopScan()}
                  >
                    {activeScan.status === "cancelling"
                      ? "Cancelling..."
                      : "Cancel"}
                  </button>
                ) : activeScan.status === "succeeded" ? (
                  <>
                    {activeScan.candidates_matched > 0 ? (
                      <button
                        className="secondary-action small-action"
                        type="button"
                        disabled={auditLoading}
                        onClick={() => void reviewScanDecisions()}
                      >
                        {auditLoading
                          ? "Loading decisions..."
                          : auditOpen
                            ? "Hide decisions"
                            : "Review decisions"}
                      </button>
                    ) : null}
                    <button
                      className="secondary-action small-action"
                      type="button"
                      onClick={() => setWorkspaceView("opportunities")}
                    >
                      View conversations
                    </button>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
          {localRuntime && activeScan && auditOpen ? (
            <section className="scan-audit" aria-label="Scan decision audit">
              <div className="scan-audit-heading">
                <div>
                  <p className="page-kicker">Classification audit</p>
                  <h2>Why candidates passed or failed</h2>
                </div>
                <span>{scanCandidates.length} AI-reviewed candidates</span>
              </div>
              {auditLoading ? (
                <p className="scan-audit-empty">Loading decisions...</p>
              ) : scanCandidates.length === 0 ? (
                <p className="scan-audit-empty">
                  No candidate decisions were retained for this scan.
                </p>
              ) : (
                <div className="scan-audit-list">
                  {scanCandidates.map((candidate) => (
                    <article className="scan-audit-card" key={candidate.id}>
                      <div className="scan-audit-meta">
                        <span
                          className={`audit-decision audit-${candidate.qualification_label}`}
                        >
                          {qualificationLabel(candidate.qualification_label)}
                        </span>
                        <span>
                          {candidate.platform === "reddit"
                            ? `Reddit${candidate.subreddit ? ` / r/${candidate.subreddit}` : ""}`
                            : "Hacker News"}
                          {` · ${candidate.item_type === "comment" ? "Comment" : "Post"}`}
                        </span>
                        <strong>{candidate.intent_score}% overall fit</strong>
                      </div>
                      <h3>
                        {candidate.title ||
                          candidate.body.slice(0, 120) ||
                          "Untitled conversation"}
                      </h3>
                      {candidate.body && candidate.title ? (
                        <p className="scan-audit-excerpt">
                          {candidate.body.slice(0, 280)}
                          {candidate.body.length > 280 ? "…" : ""}
                        </p>
                      ) : null}
                      <p className="scan-audit-reason">{candidate.reasoning}</p>
                      {candidate.audience_fit != null ? (
                        <div className="scan-audit-dimensions">
                          <span>
                            Audience <strong>{candidate.audience_fit}%</strong>
                          </span>
                          <span>
                            Problem <strong>{candidate.problem_fit}%</strong>
                          </span>
                          <span>
                            Seeking{" "}
                            <strong>{candidate.solution_seeking}%</strong>
                          </span>
                          <span>
                            Buying <strong>{candidate.buying_intent}%</strong>
                          </span>
                          <span>
                            Reply fit{" "}
                            <strong>{candidate.reply_appropriateness}%</strong>
                          </span>
                        </div>
                      ) : (
                        <p className="scan-audit-legacy">
                          Legacy decision — rescan to see dimension scores.
                        </p>
                      )}
                      <div className="scan-audit-footer">
                        <span>
                          Matched: {candidate.matched_phrases.join(", ")}
                        </span>
                        <a
                          href={candidate.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          {scanError ? (
            <p className="notice-banner notice-error" role="alert">
              {scanError}
            </p>
          ) : null}
          {workspaceView === "products" ? (
            <>
              {loadError ? (
                <section className="notice-banner notice-error" role="alert">
                  <div>
                    <strong>We could not load your products</strong>
                    <p>{loadError}</p>
                  </div>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={pending === "reload"}
                    onClick={() => void reloadProducts()}
                  >
                    {pending === "reload" ? "Retrying..." : "Try again"}
                  </button>
                </section>
              ) : null}

              {notice ? (
                <p className="notice-banner notice-success" role="status">
                  {notice}
                </p>
              ) : null}

              <section className="metrics-grid" aria-label="Workspace summary">
                <article className="metric-card">
                  <span>Active products</span>
                  <strong>{products.length}</strong>
                  <p>Products currently being monitored</p>
                </article>
                <article className="metric-card">
                  <span>Listening phrases</span>
                  <strong>{keywordCount}</strong>
                  <p>Keywords and customer phrases tracked</p>
                </article>
                <article className="metric-card">
                  <span>Discovery sources</span>
                  <strong>2 configured</strong>
                  <p>HN ready; Reddit runs only while locally supervised</p>
                </article>
              </section>

              <section
                className="products-panel"
                aria-labelledby="products-title"
              >
                <div className="panel-heading">
                  <div>
                    <h2 id="products-title">Your products</h2>
                    <p>
                      Manage what Mentionish searches for across communities.
                    </p>
                  </div>
                  <span className="result-count">
                    {products.length}{" "}
                    {products.length === 1 ? "product" : "products"}
                  </span>
                </div>

                {products.length === 0 && !loadError ? (
                  <div className="dashboard-empty">
                    <span className="empty-icon" aria-hidden="true">
                      +
                    </span>
                    <h3>Add your first product</h3>
                    <p>
                      A short, guided setup will collect your product
                      description, listening phrases, and optional voice
                      guidance.
                    </p>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={openCreate}
                    >
                      Set up a product
                    </button>
                  </div>
                ) : (
                  <div className="product-table">
                    <div className="product-table-header" aria-hidden="true">
                      <span>Product</span>
                      <span>Listening phrases</span>
                      <span>Source</span>
                      <span>Last updated</span>
                      <span>Actions</span>
                    </div>
                    {products.map((product) => (
                      <article className="product-row" key={product.id}>
                        <div className="product-identity">
                          <span className="product-monogram">
                            {product.name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <h3>{product.name}</h3>
                            <p>{product.description}</p>
                          </div>
                        </div>
                        <div className="keyword-summary">
                          <strong>{product.keywords.length}</strong>
                          <span>{product.keywords.slice(0, 2).join(", ")}</span>
                        </div>
                        <div>
                          <span className="source-pill">
                            <span className="health-dot" />
                            Reddit + HN
                          </span>
                        </div>
                        <time dateTime={product.updated_at}>
                          {new Date(product.updated_at).toLocaleDateString()}
                        </time>
                        <div className="row-actions">
                          {localRuntime ? (
                            <button
                              className="secondary-action small-action"
                              type="button"
                              disabled={Boolean(
                                activeScan &&
                                ["pending", "running", "cancelling"].includes(
                                  activeScan.status,
                                ),
                              )}
                              onClick={() => void beginScan(product.id)}
                            >
                              Scan
                            </button>
                          ) : null}{" "}
                          <button
                            className="secondary-action small-action"
                            type="button"
                            disabled={pending !== null}
                            onClick={() => openEdit(product)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-danger"
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void removeProduct(product)}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {archivedProducts.length > 0 ? (
                <section
                  className="products-panel"
                  aria-labelledby="archived-title"
                >
                  <div className="panel-heading">
                    <div>
                      <h2 id="archived-title">Archived products</h2>
                      <p>
                        Restore a product within its 30-day recovery window.
                      </p>
                    </div>
                    <span className="result-count">
                      {archivedProducts.length} archived
                    </span>
                  </div>
                  <div className="product-table">
                    {archivedProducts.map((product) => (
                      <article className="product-row" key={product.id}>
                        <div className="product-identity">
                          <span className="product-monogram">
                            {product.name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <h3>{product.name}</h3>
                            <p>Discovery is paused for this product.</p>
                          </div>
                        </div>
                        <div className="keyword-summary">
                          <strong>{product.keywords.length}</strong>
                          <span>saved phrases</span>
                        </div>
                        <div>
                          <span className="source-pill">Archived</span>
                        </div>
                        <time
                          dateTime={product.deleted_at ?? product.updated_at}
                        >
                          {new Date(
                            product.deleted_at ?? product.updated_at,
                          ).toLocaleDateString()}
                        </time>
                        <div className="row-actions">
                          <button
                            className="secondary-action small-action"
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void restoreArchivedProduct(product)}
                          >
                            {pending === "restore" ? "Restoring..." : "Restore"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : workspaceView === "overview" ? (
            <OverviewPanel
              usage={usage}
              products={products}
              onNavigate={setWorkspaceView}
              localRuntime={localRuntime}
            />
          ) : workspaceView === "analytics" ? (
            <AnalyticsPanel accessToken={accessToken} products={products} />
          ) : workspaceView === "settings" ? (
            <div className="settings-stack">
              <RedditSettingsPanel accessToken={accessToken} />
              <AiSettingsPanel accessToken={accessToken} />
            </div>
          ) : (
            <OpportunitiesPanel
              accessToken={accessToken}
              products={products}
              usage={usage}
              onUsageRefresh={() => void refreshUsage()}
            />
          )}
        </div>
      </main>

      {formOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeForm}
        >
          <section
            ref={setupModalRef}
            className="setup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="page-kicker">
                  {editingId ? "Product settings" : "Guided setup"}
                </p>
                <h2 id="setup-title">
                  {editingId ? "Edit your product" : "Add a product"}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close setup"
                onClick={closeForm}
              >
                x
              </button>
            </header>

            <ol className="setup-progress">
              {["Product", "Phrases", "Voice"].map((label, index) => {
                const number = index + 1;
                return (
                  <li
                    className={
                      number === step
                        ? "progress-step progress-current"
                        : number < step
                          ? "progress-step progress-complete"
                          : "progress-step"
                    }
                    key={label}
                  >
                    <span>{number < step ? "OK" : number}</span>
                    {label}
                  </li>
                );
              })}
            </ol>

            <form
              className="setup-form"
              onSubmit={(event) => void submitProductForm(event)}
            >
              {step === 1 ? (
                <fieldset>
                  <legend>Tell us what you are building</legend>
                  <p className="field-intro">
                    This context helps Mentionish distinguish useful
                    conversations from simple keyword mentions.
                  </p>
                  <label htmlFor="product-name">Product name</label>
                  <input
                    id="product-name"
                    maxLength={80}
                    autoFocus
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    placeholder="e.g. Acme Analytics"
                  />
                  <div className="field-heading">
                    <label htmlFor="product-description">
                      What problem does it solve?
                    </label>
                    <span>{form.description.length}/2000</span>
                  </div>
                  <textarea
                    id="product-description"
                    maxLength={2000}
                    required
                    rows={6}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    placeholder="Describe who it helps, their problem, and the outcome your product provides."
                  />
                  <div className="field-heading">
                    <label htmlFor="product-audience">
                      Who is the ideal customer?{" "}
                      <span className="optional">(optional)</span>
                    </label>
                    <span>{form.audience.length}/1000</span>
                  </div>
                  <textarea
                    id="product-audience"
                    maxLength={1000}
                    rows={3}
                    value={form.audience}
                    onChange={(event) =>
                      setForm({ ...form, audience: event.target.value })
                    }
                    placeholder="e.g. Solo SaaS founders who need their first customers but cannot monitor communities all day."
                  />
                </fieldset>
              ) : null}

              {step === 2 ? (
                <fieldset>
                  <legend>Add listening phrases</legend>
                  <p className="field-intro">
                    Use phrases a real customer might write when asking for help
                    or comparing solutions. One phrase per line works best.
                  </p>
                  <div className="field-heading">
                    <label htmlFor="product-keywords">Customer phrases</label>
                    <span>{keywords.length}/25</span>
                  </div>{" "}
                  <div className="phrase-ai-toolbar">
                    <div>
                      <strong>Need better phrases?</strong>
                      <span>
                        AI suggestions are optional and never saved until you
                        add and review them.
                      </span>
                    </div>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={suggesting}
                      onClick={() => void generatePhraseSuggestions()}
                    >
                      {suggesting ? "Generating..." : "Suggest with AI"}
                    </button>
                  </div>
                  {phraseSuggestions.length > 0 ? (
                    <div
                      className="phrase-suggestions"
                      aria-label="AI phrase suggestions"
                    >
                      <div className="phrase-suggestion-actions">
                        <span>
                          Balanced across pains, questions, comparisons,
                          workflows, and audiences.
                        </span>
                        <button
                          type="button"
                          className="secondary-action small-action"
                          onClick={useRecommendedPhraseSet}
                        >
                          Replace editor with this set
                        </button>
                      </div>
                      {phraseSuggestions.map((suggestion) => (
                        <article
                          key={`${suggestion.kind}:${suggestion.phrase}`}
                        >
                          <div>
                            <span>{suggestion.kind}</span>
                            <strong>{suggestion.phrase}</strong>
                            <p>{suggestion.rationale}</p>
                          </div>
                          <button
                            type="button"
                            className="secondary-action small-action"
                            onClick={() => addSuggestedPhrase(suggestion)}
                          >
                            Add
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    id="product-keywords"
                    autoFocus
                    required
                    rows={9}
                    value={form.keywords}
                    onChange={(event) =>
                      setForm({ ...form, keywords: event.target.value })
                    }
                    placeholder={
                      "reduce customer churn\ncustomer retention software\nwhy are users cancelling"
                    }
                  />
                  <div className="example-box">
                    <strong>Good phrases are specific</strong>
                    <span>
                      Mix specific pains, questions, tool comparisons, short
                      workflows, and audience context. Mentionish expands them
                      into broader search queries automatically.
                    </span>
                  </div>
                </fieldset>
              ) : null}

              {step === 3 ? (
                <fieldset>
                  <legend>Set your response style</legend>
                  <p className="field-intro">
                    Optional guidance keeps future drafts aligned with your
                    voice. Nothing will ever be posted automatically.
                  </p>
                  <label htmlFor="voice-persona">
                    Voice guidance <span className="optional">(optional)</span>
                  </label>
                  <textarea
                    id="voice-persona"
                    autoFocus
                    maxLength={1000}
                    rows={5}
                    value={form.voicePersona}
                    onChange={(event) =>
                      setForm({ ...form, voicePersona: event.target.value })
                    }
                    placeholder="Helpful and direct. Share practical detail before mentioning the product. Avoid sales language."
                  />
                  <div className="setup-summary">
                    <span className="summary-mark">M</span>
                    <div>
                      <strong>Ready to start listening</strong>
                      <p>
                        {form.name || "Your product"} will track{" "}
                        {keywords.length}{" "}
                        {keywords.length === 1 ? "phrase" : "phrases"} on Hacker
                        News. Reddit runs only during supervised discovery
                        sessions.
                      </p>
                    </div>
                  </div>
                </fieldset>
              ) : null}

              {formError ? (
                <p className="inline-error" role="alert">
                  {formError}
                </p>
              ) : null}

              <footer className="modal-footer">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={pending === "save"}
                  onClick={step === 1 ? closeForm : () => setStep(step - 1)}
                >
                  {step === 1 ? "Cancel" : "Back"}
                </button>
                {step < 3 ? (
                  <button
                    key={`continue-${step}`}
                    className="primary-action"
                    type="submit"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    key="save-product"
                    className="primary-action"
                    type="submit"
                    disabled={pending === "save" || !saveReady}
                  >
                    {pending === "save"
                      ? "Saving product..."
                      : editingId
                        ? "Save changes"
                        : "Start listening"}
                  </button>
                )}
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
