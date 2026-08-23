"use client";

import type {
  CreateProductInput,
  OpportunityFeedItem,
  OpportunityFeedbackReason,
  OpportunityFeedbackVerdict,
  Product,
  UpdateProductInput,
  UsageSummary,
  AnalyticsSummary,
  DiscoveryProfile,
} from "@mentionish/types";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  Suspense,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
  saveOpportunityFeedback,
  markOpportunityPosted,
} from "../../lib/opportunities-api";
import { getAnalytics, getUsage } from "../../lib/workspace-api";
import { getLocalInstallationToken, isLocalRuntime } from "../../lib/runtime";
import {
  enhanceProductContext,
  getAiSettings,
  suggestPhrases,
  type PhraseSuggestion,
  type ProductContextEnhancement,
} from "../../lib/ai-api";
import { getRedditConfiguration } from "../../lib/reddit-api";
import { AppIcon } from "../../components/app-icon";
import { ScanStatusPanel } from "../../components/scan-status";
import { WorkspaceSettings } from "../../components/workspace-settings";
import {
  startScan,
  getScan,
  listScans,
  cancelScan,
  exportCandidateEvaluation,
  getCandidateEvaluation,
  listScanCandidates,
  reviewScanCandidate,
  type CandidateEvaluationSummary,
  type CandidateHumanReview,
  type CandidateHumanTier,
  type ScanCandidateAudit,
  type ScanRun,
} from "../../lib/scans-api";

interface ProductFormState {
  name: string;
  description: string;
  audience: string;
  keywords: string;
  voicePersona: string;
  discoveryProfile: DiscoveryProfile | null;
}
type SavedPhrase = NonNullable<Product["phrases"]>[number];

const emptyForm: ProductFormState = {
  name: "",
  description: "",
  audience: "",
  keywords: "",
  voicePersona: "",
  discoveryProfile: null,
};

function formFromProduct(product: Product): ProductFormState {
  return {
    name: product.name,
    description: product.description,
    audience: product.audience ?? "",
    keywords: product.keywords.join("\n"),
    voicePersona: product.voice_persona ?? "",
    discoveryProfile: product.discovery_profile ?? null,
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

type WorkspaceView =
  "overview" | "products" | "opportunities" | "analytics" | "settings";

const workspaceMeta: Record<
  WorkspaceView,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "Workspace",
    title: "Home",
    description: "See what is ready and choose your next discovery action.",
  },
  products: {
    eyebrow: "Discovery setup",
    title: "Products",
    description: "Define what to look for and run focused scans.",
  },
  opportunities: {
    eyebrow: "Review queue",
    title: "Conversations",
    description: "Review ranked conversations and decide where to help.",
  },
  analytics: {
    eyebrow: "History and outcomes",
    title: "Activity",
    description: "Understand discovery coverage and review outcomes.",
  },
  settings: {
    eyebrow: "Local configuration",
    title: "Settings",
    description: "Manage AI models, sources, and local workspace readiness.",
  },
};

const workspacePaths: Record<WorkspaceView, string> = {
  overview: "/dashboard",
  products: "/dashboard/products",
  opportunities: "/dashboard/conversations",
  analytics: "/dashboard/activity",
  settings: "/dashboard/settings/sources",
};

function workspaceViewFromPath(pathname: string): WorkspaceView {
  const section = pathname.split("/").filter(Boolean)[1];
  if (section === "products") return "products";
  if (section === "conversations") return "opportunities";
  if (section === "activity") return "analytics";
  if (section === "settings") return "settings";
  return "overview";
}

function qualificationLabel(
  label: "rejected" | "worth_helping" | "potential_buyer" | null | undefined,
): string {
  if (label === "potential_buyer") return "Best opportunity";
  if (label === "worth_helping") return "Possible match";
  return "Rejected";
}

function discoveryTierLabel(
  tier: ScanCandidateAudit["discovery_tier"],
): string {
  if (tier === "direct_opportunity") return "Best opportunity";
  if (tier === "helpful_conversation") return "Helpful conversation";
  if (tier === "market_signal") return "Market signal";
  return "Not relevant";
}

const phraseSuggestionGroups: Array<{
  kind: PhraseSuggestion["kind"];
  label: string;
  description: string;
}> = [
  {
    kind: "problem",
    label: "Pain signals",
    description: "Problems customers describe in their own words",
  },
  {
    kind: "question",
    label: "Help requests",
    description: "Questions that show someone is actively looking",
  },
  {
    kind: "alternative",
    label: "Comparisons",
    description: "Alternatives, replacements, and tool searches",
  },
  {
    kind: "category",
    label: "Category terms",
    description: "Short terms that expand discovery coverage",
  },
  {
    kind: "audience",
    label: "Audience context",
    description: "Language your ideal customer uses to identify themselves",
  },
];

const discoveryProfileGroups: Array<{
  key: keyof DiscoveryProfile;
  label: string;
}> = [
  { key: "audiences", label: "Audience" },
  { key: "problems", label: "Problems" },
  { key: "situations", label: "Triggering situations" },
  { key: "desired_outcomes", label: "Desired outcomes" },
  { key: "alternatives", label: "Alternatives" },
  { key: "buying_signals", label: "Buying signals" },
  { key: "helpful_signals", label: "Helpful signals" },
  { key: "market_signals", label: "Market signals" },
  { key: "exclusions", label: "Exclude" },
  { key: "communities", label: "Likely communities" },
];

const voicePresets = [
  {
    id: "helpful",
    label: "Helpful first",
    guidance:
      "Lead with useful, practical advice before mentioning any product.",
  },
  {
    id: "concise",
    label: "Concise",
    guidance: "Keep replies concise, direct, and easy to scan.",
  },
  {
    id: "founder",
    label: "Friendly founder",
    guidance:
      "Use a friendly, peer-to-peer founder voice without sounding promotional.",
  },
  {
    id: "technical",
    label: "Technical",
    guidance: "Use precise technical detail when it helps answer the question.",
  },
  {
    id: "disclose",
    label: "Disclose relevance",
    guidance:
      "Disclose product affiliation whenever the product is relevant to the reply.",
  },
  {
    id: "truthful",
    label: "No invented experience",
    guidance:
      "Never claim personal experience, results, or product use that is not provided.",
  },
] as const;

type PhraseKind = PhraseSuggestion["kind"];

function inferPhraseKind(phrase: string): PhraseKind {
  const normalized = phrase.toLocaleLowerCase();
  if (
    /^(how|where|what|why|which|anyone|can i|is there)\b|\?$/.test(normalized)
  )
    return "question";
  if (
    /\b(vs|versus|alternative|replacement|recommend|tool|software)\b/.test(
      normalized,
    )
  )
    return "alternative";
  if (
    /\b(founder|recruiter|marketer|agency|team|developer|creator)\b/.test(
      normalized,
    )
  )
    return "audience";
  if (
    /\b(platform|workflow|automation|monitoring|discovery|research)\b/.test(
      normalized,
    )
  )
    return "category";
  return "problem";
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

const feedbackReasons: Record<
  OpportunityFeedbackVerdict,
  Array<{ value: OpportunityFeedbackReason; label: string }>
> = {
  useful: [
    { value: "strong_problem", label: "Strong problem match" },
    { value: "clear_intent", label: "Clear help or buying intent" },
    { value: "good_audience", label: "Right audience" },
    { value: "actionable", label: "Actionable conversation" },
  ],
  not_relevant: [
    { value: "wrong_audience", label: "Wrong audience" },
    { value: "wrong_problem", label: "Wrong problem" },
    { value: "weak_intent", label: "Not enough intent" },
    { value: "promotional", label: "Promotional or self-serving" },
    { value: "outdated", label: "Too old" },
    { value: "duplicate", label: "Duplicate" },
    { value: "missing_context", label: "Missing context" },
    { value: "other", label: "Other" },
  ],
};

function feedbackReasonLabel(reason: OpportunityFeedbackReason): string {
  return (
    [...feedbackReasons.useful, ...feedbackReasons.not_relevant].find(
      (option) => option.value === reason,
    )?.label ?? reason
  );
}

function ConversationFeedback({
  accessToken,
  item,
  onSaved,
}: {
  accessToken: string;
  item: OpportunityFeedItem;
  onSaved: () => void;
}) {
  const [verdict, setVerdict] = useState<OpportunityFeedbackVerdict | null>(
    item.feedback?.verdict ?? null,
  );
  const [reason, setReason] = useState<OpportunityFeedbackReason | null>(
    item.feedback?.reason ?? null,
  );
  const [note, setNote] = useState(item.feedback?.note ?? "");
  const [editing, setEditing] = useState(item.feedback === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVerdict(item.feedback?.verdict ?? null);
    setReason(item.feedback?.reason ?? null);
    setNote(item.feedback?.note ?? "");
    setEditing(item.feedback === null);
  }, [item.id, item.feedback]);

  function choose(nextVerdict: OpportunityFeedbackVerdict) {
    setVerdict(nextVerdict);
    setReason(feedbackReasons[nextVerdict][0]?.value ?? null);
    setEditing(true);
    setError(null);
  }

  async function save() {
    if (!verdict || !reason) return;
    setSaving(true);
    setError(null);
    try {
      await saveOpportunityFeedback(accessToken, item.id, {
        verdict,
        reason,
        note: note.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="conversation-feedback" aria-label="Result feedback">
      <div className="conversation-feedback-heading">
        <div>
          <strong>Was this result useful?</strong>
          <span>
            Ratings tune future ranking. Your phrases never change
            automatically.
          </span>
        </div>
        {item.feedback && !editing ? (
          <button
            className="text-action"
            type="button"
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        ) : null}
      </div>
      {item.feedback && !editing ? (
        <div className={`feedback-saved feedback-${item.feedback.verdict}`}>
          <strong>
            {item.feedback.verdict === "useful" ? "Useful" : "Not relevant"}
          </strong>
          <span>{feedbackReasonLabel(item.feedback.reason)}</span>
        </div>
      ) : (
        <>
          <div className="feedback-verdicts">
            <button
              className={verdict === "useful" ? "is-selected is-useful" : ""}
              type="button"
              onClick={() => choose("useful")}
            >
              Useful
            </button>
            <button
              className={
                verdict === "not_relevant" ? "is-selected is-negative" : ""
              }
              type="button"
              onClick={() => choose("not_relevant")}
            >
              Not relevant
            </button>
          </div>
          {verdict ? (
            <div className="feedback-fields">
              <label>
                Why?
                <select
                  value={reason ?? ""}
                  onChange={(event) =>
                    setReason(event.target.value as OpportunityFeedbackReason)
                  }
                >
                  {feedbackReasons[verdict].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feedback-note">
                Note <span>(optional)</span>
                <input
                  value={note}
                  maxLength={500}
                  placeholder="What did the ranking miss?"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <button
                className="primary-action small-action"
                type="button"
                disabled={!reason || saving}
                onClick={() => void save()}
              >
                {saving ? "Saving..." : "Save rating"}
              </button>
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p className="inline-card-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function CandidateReviewControls({
  accessToken,
  candidate,
  onSaved,
}: {
  accessToken: string;
  candidate: ScanCandidateAudit;
  onSaved: (review: CandidateHumanReview) => void;
}) {
  const [note, setNote] = useState(candidate.human_review?.note ?? "");
  const [savingTier, setSavingTier] = useState<CandidateHumanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote(candidate.human_review?.note ?? "");
  }, [candidate.id, candidate.human_review]);

  async function save(humanTier: CandidateHumanTier) {
    setSavingTier(humanTier);
    setError(null);
    try {
      const review = await reviewScanCandidate(
        accessToken,
        candidate.id,
        humanTier,
        note.trim() || null,
      );
      onSaved(review);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingTier(null);
    }
  }

  const reviewOptions: Array<{
    tier: CandidateHumanTier;
    label: string;
  }> = [
    { tier: "direct_opportunity", label: "Should be Best" },
    { tier: "helpful_conversation", label: "Should be Possible" },
    { tier: "market_signal", label: "Market signal only" },
    { tier: "irrelevant", label: "Should be irrelevant" },
  ];
  const alternatives = reviewOptions.filter(
    (option) => option.tier !== candidate.discovery_tier,
  );

  return (
    <section className="candidate-human-review" aria-label="Human review">
      <div className="candidate-review-heading">
        <div>
          <strong>Human quality check</strong>
          <span>
            Labels measure AI errors. They never change thresholds
            automatically.
          </span>
        </div>
        {candidate.human_review ? (
          <span className="candidate-review-saved">
            Reviewed: {discoveryTierLabel(candidate.human_review.human_tier)}
          </span>
        ) : null}
      </div>
      <input
        value={note}
        maxLength={500}
        placeholder="Optional note about what the AI missed"
        aria-label="Optional candidate review note"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="candidate-review-actions">
        <button
          className="secondary-action small-action"
          type="button"
          disabled={savingTier !== null}
          onClick={() => void save(candidate.discovery_tier)}
        >
          {savingTier === candidate.discovery_tier
            ? "Saving..."
            : "Correct decision"}
        </button>
        {alternatives.map((option) => (
          <button
            className="text-action"
            type="button"
            key={option.tier}
            disabled={savingTier !== null}
            onClick={() => void save(option.tier)}
          >
            {savingTier === option.tier ? "Saving..." : option.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="inline-card-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ConversationQueueGroup({
  title,
  description,
  count,
  items,
  emptyMessage,
  selectedKey,
  onSelect,
}: {
  title: string;
  description: string;
  count: number;
  items: OpportunityFeedItem[];
  emptyMessage?: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="conversation-queue-group">
      <div className="conversation-queue-heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <span>{count}</span>
      </div>
      {items.length === 0 && emptyMessage ? (
        <p className="conversation-queue-empty">{emptyMessage}</p>
      ) : null}
      {items.map((item) => {
        const key = `qualified:${item.id}`;
        return (
          <button
            className={`conversation-queue-item ${selectedKey === key ? "conversation-queue-item-active" : ""}`}
            type="button"
            key={key}
            onClick={() => onSelect(key)}
          >
            <span className="queue-item-meta">
              {item.post.platform === "reddit" ? "Reddit" : "Hacker News"}
              {item.intent_score != null ? (
                <span>{item.intent_score}% fit</span>
              ) : null}
            </span>
            <strong>{item.post.title || "Untitled conversation"}</strong>
            <span className="queue-item-reason">{item.reasoning}</span>
          </button>
        );
      })}
    </div>
  );
}

function OpportunitiesPanel({
  accessToken,
  products,
  usage,
  initialProductId,
  onProductChange,
  onUsageRefresh,
}: {
  accessToken: string | null;
  products: Product[];
  usage: UsageSummary | null;
  initialProductId?: string;
  onProductChange: (productId: string) => void;
  onUsageRefresh: () => void;
}) {
  const [productId, setProductId] = useState(
    initialProductId ?? products[0]?.id ?? "",
  );
  const [platform, setPlatform] = useState<"all" | "reddit" | "hackernews">(
    "all",
  );
  const [workflow, setWorkflow] = useState<"active" | "replied" | "skipped">(
    "active",
  );
  const [tier, setTier] = useState<
    "all" | "best" | "possible" | "market" | "other"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<OpportunityFeedItem[]>([]);
  const [otherMatches, setOtherMatches] = useState<ScanCandidateAudit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedConversationKey, setSelectedConversationKey] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!productId && products[0]) setProductId(products[0].id);
  }, [productId, products]);

  useEffect(() => {
    if (
      initialProductId &&
      products.some((product) => product.id === initialProductId)
    )
      setProductId(initialProductId);
  }, [initialProductId, products]);

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

  async function markReplied(item: OpportunityFeedItem) {
    if (!accessToken) return;
    setWorkingId(item.id);
    setFeedError(null);
    try {
      await markOpportunityPosted(accessToken, item.id);
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

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const matchesSearch = (title: string, body: string, reasoning: string) =>
    !normalizedSearch ||
    `${title} ${body} ${reasoning}`
      .toLocaleLowerCase()
      .includes(normalizedSearch);
  const bestItems = items.filter(
    (item) =>
      (tier === "all" || tier === "best") &&
      item.qualification_label === "potential_buyer" &&
      matchesSearch(
        item.post.title,
        item.post.body ?? "",
        item.reasoning ?? "",
      ),
  );
  const possibleItems = items.filter(
    (item) =>
      (tier === "all" || tier === "possible") &&
      item.qualification_label !== "potential_buyer" &&
      matchesSearch(
        item.post.title,
        item.post.body ?? "",
        item.reasoning ?? "",
      ),
  );
  const orderedItems = [...bestItems, ...possibleItems];
  const visibleKeys = new Set(
    items.map(
      (item) =>
        `${item.post.author?.trim().toLocaleLowerCase() ?? ""}|${item.post.title.trim().toLocaleLowerCase()}`,
    ),
  );
  const seenOther = new Set<string>();
  const uniqueCandidateMatches = otherMatches.filter((candidate) => {
    const key = `${candidate.author?.trim().toLocaleLowerCase() ?? ""}|${candidate.title.trim().toLocaleLowerCase()}`;
    const tierVisible =
      tier === "all" ||
      (tier === "market" && candidate.discovery_tier === "market_signal") ||
      (tier === "other" && candidate.discovery_tier !== "market_signal");
    if (
      !tierVisible ||
      !matchesSearch(candidate.title, candidate.body, candidate.reasoning) ||
      visibleKeys.has(key) ||
      seenOther.has(key)
    )
      return false;
    seenOther.add(key);
    return true;
  });
  const marketSignals = uniqueCandidateMatches.filter(
    (candidate) => candidate.discovery_tier === "market_signal",
  );
  const uniqueOtherMatches = uniqueCandidateMatches.filter(
    (candidate) => candidate.discovery_tier !== "market_signal",
  );
  const reviewCandidates = [...marketSignals, ...uniqueOtherMatches];
  const explicitQualified = orderedItems.find(
    (item) => `qualified:${item.id}` === selectedConversationKey,
  );
  const explicitOther = reviewCandidates.find(
    (candidate) => `other:${candidate.id}` === selectedConversationKey,
  );
  const selectedQualified = explicitOther
    ? undefined
    : (explicitQualified ?? orderedItems[0]);
  const selectedOther = explicitQualified
    ? undefined
    : (explicitOther ??
      (orderedItems.length === 0 ? reviewCandidates[0] : undefined));

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
              onChange={(event) => {
                setProductId(event.target.value);
                onProductChange(event.target.value);
              }}
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
      <div className="conversation-controls" aria-label="Conversation filters">
        <label>
          <span>Search results</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Title, content, or reason"
          />
        </label>
        <label>
          <span>Opportunity tier</span>
          <select
            value={tier}
            onChange={(event) => setTier(event.target.value as typeof tier)}
          >
            <option value="all">All tiers</option>
            <option value="best">Best opportunities</option>
            <option value="possible">Possible matches</option>
            <option value="market">Market signals</option>
            <option value="other">Other discovered matches</option>
          </select>
        </label>
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
          <strong>No discovered conversations yet</strong>
          <p>
            Reddit discovery is active through the supervised browser bridge.
            Hacker News continues as the fallback source.
          </p>
        </div>
      ) : null}
      {!feedLoading &&
      items.length + otherMatches.length > 0 &&
      orderedItems.length + reviewCandidates.length === 0 ? (
        <div className="feed-state">
          <strong>
            {tier === "best"
              ? "No best opportunities in this scan"
              : "No conversations match these filters"}
          </strong>
          <p>
            {tier === "best"
              ? "Best opportunities require a clear core problem, active solution search, and explicit interest in the product category. Review Possible matches or run a later scan."
              : "Clear the search or choose another opportunity tier."}
          </p>
        </div>
      ) : null}
      {orderedItems.length > 0 || reviewCandidates.length > 0 ? (
        <div className="conversation-review-layout">
          <aside className="conversation-queue" aria-label="Conversation queue">
            {tier === "all" || bestItems.length > 0 ? (
              <ConversationQueueGroup
                title="Best opportunities"
                description="Clear need and solution interest"
                count={bestItems.length}
                items={bestItems}
                emptyMessage="None met the direct-opportunity standard in this scan. Possible matches may still be useful."
                selectedKey={
                  selectedQualified ? `qualified:${selectedQualified.id}` : null
                }
                onSelect={setSelectedConversationKey}
              />
            ) : null}
            {possibleItems.length > 0 ? (
              <ConversationQueueGroup
                title="Possible matches"
                description="Relevant conversations worth reviewing"
                count={possibleItems.length}
                items={possibleItems}
                selectedKey={
                  selectedQualified ? `qualified:${selectedQualified.id}` : null
                }
                onSelect={setSelectedConversationKey}
              />
            ) : null}
            {[
              {
                title: "Market signals",
                description: "Audience language, alternatives, and competitors",
                candidates: marketSignals,
              },
              {
                title: "Other discovered matches",
                description:
                  "Low-confidence evidence retained for transparency",
                candidates: uniqueOtherMatches,
              },
            ].map((group) =>
              group.candidates.length > 0 ? (
                <div className="conversation-queue-group" key={group.title}>
                  <div className="conversation-queue-heading">
                    <div>
                      <strong>{group.title}</strong>
                      <span>{group.description}</span>
                    </div>
                    <span>{group.candidates.length}</span>
                  </div>
                  {group.candidates.map((candidate) => {
                    const key = `other:${candidate.id}`;
                    return (
                      <button
                        className={`conversation-queue-item ${selectedOther?.id === candidate.id ? "conversation-queue-item-active" : ""}`}
                        type="button"
                        key={key}
                        onClick={() => setSelectedConversationKey(key)}
                      >
                        <span className="queue-item-meta">
                          {candidate.platform === "reddit"
                            ? "Reddit"
                            : "Hacker News"}
                          <span>{candidate.intent_score}% fit</span>
                        </span>
                        <strong>
                          {candidate.title ||
                            candidate.body.slice(0, 90) ||
                            "Untitled conversation"}
                        </strong>
                        <span className="queue-item-reason">
                          {candidate.reasoning}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null,
            )}
            {nextCursor ? (
              <button
                className="secondary-action queue-load-more"
                type="button"
                disabled={feedLoading}
                onClick={() => void loadFeed(nextCursor, true)}
              >
                {feedLoading ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </aside>

          <section className="conversation-detail" aria-live="polite">
            {selectedQualified ? (
              <>
                <div className="conversation-detail-header">
                  <div className="opportunity-meta">
                    <span
                      className={`platform-badge platform-${selectedQualified.post.platform}`}
                    >
                      {selectedQualified.post.platform === "reddit"
                        ? `Reddit${selectedQualified.post.subreddit ? ` / r/${selectedQualified.post.subreddit}` : ""}`
                        : "Hacker News"}
                    </span>
                    <span>
                      {selectedQualified.post.author
                        ? `by ${selectedQualified.post.author}`
                        : "Author unavailable"}
                    </span>
                    <time
                      dateTime={
                        selectedQualified.post.source_created_at ??
                        selectedQualified.created_at
                      }
                    >
                      {new Date(
                        selectedQualified.post.source_created_at ??
                          selectedQualified.created_at,
                      ).toLocaleDateString()}
                    </time>
                  </div>
                  <h3>
                    {selectedQualified.post.title || "Untitled conversation"}
                  </h3>
                </div>
                <div className="conversation-source-content">
                  {selectedQualified.post.body ||
                    "Open the source to read the conversation."}
                </div>
                <div className="match-explanation">
                  <div>
                    <span>Why this matched</span>
                    <strong>
                      {qualificationLabel(
                        selectedQualified.qualification_label ??
                          "worth_helping",
                      )}
                      {selectedQualified.intent_score == null
                        ? ""
                        : ` · ${selectedQualified.intent_score}% overall fit`}
                    </strong>
                  </div>
                  <p>{selectedQualified.reasoning}</p>
                  {selectedQualified.buying_intent != null ? (
                    <div className="fit-dimensions">
                      <span>
                        Problem{" "}
                        <strong>{selectedQualified.problem_fit}%</strong>
                      </span>
                      <span>
                        Seeking{" "}
                        <strong>{selectedQualified.solution_seeking}%</strong>
                      </span>
                      <span>
                        Buying{" "}
                        <strong>{selectedQualified.buying_intent}%</strong>
                      </span>
                    </div>
                  ) : null}
                </div>
                <ConversationFeedback
                  accessToken={accessToken ?? ""}
                  item={selectedQualified}
                  onSaved={() => void loadFeed()}
                />
                <DraftEditor
                  accessToken={accessToken ?? ""}
                  item={selectedQualified}
                  onSaved={() => void loadFeed()}
                />
                <div className="conversation-detail-actions">
                  <button
                    className="primary-action"
                    type="button"
                    disabled={
                      workflow !== "active" ||
                      workingId === selectedQualified.id ||
                      usage?.draft.remaining === 0
                    }
                    onClick={() => void generate(selectedQualified)}
                  >
                    {workingId === selectedQualified.id
                      ? "Generating…"
                      : selectedQualified.draft
                        ? "Regenerate draft"
                        : "Generate draft"}
                  </button>
                  <a
                    className="secondary-action"
                    href={selectedQualified.post.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source
                  </a>
                  {selectedQualified.post.platform === "hackernews" &&
                  selectedQualified.draft ? (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => void copyDraft(selectedQualified)}
                    >
                      Copy draft
                    </button>
                  ) : null}
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={workflow !== "active"}
                    onClick={() => void markReplied(selectedQualified)}
                  >
                    Mark replied
                  </button>
                </div>
                <p className="manual-reply-note">
                  Mentionish prepares text only. Review the source and post
                  manually.
                </p>
              </>
            ) : selectedOther ? (
              <>
                <div className="conversation-detail-header">
                  <div className="opportunity-meta">
                    <span
                      className={`platform-badge platform-${selectedOther.platform}`}
                    >
                      {selectedOther.platform === "reddit"
                        ? `Reddit${selectedOther.subreddit ? ` / r/${selectedOther.subreddit}` : ""}`
                        : "Hacker News"}
                    </span>
                    <span>
                      {selectedOther.item_type === "comment"
                        ? "Comment"
                        : "Post"}
                    </span>
                  </div>
                  <h3>
                    {selectedOther.title ||
                      selectedOther.body.slice(0, 120) ||
                      "Untitled conversation"}
                  </h3>
                </div>
                <div className="conversation-source-content">
                  {selectedOther.body ||
                    "Open the source to read the conversation."}
                </div>
                <div className="match-explanation match-explanation-low">
                  <div>
                    <span>Why this matched</span>
                    <strong>
                      {selectedOther.discovery_tier === "market_signal"
                        ? "Market signal"
                        : "Low-confidence match"}{" "}
                      · {selectedOther.intent_score}% ranked fit
                    </strong>
                  </div>
                  <p>{selectedOther.reasoning}</p>
                  <div className="fit-dimensions">
                    <span>
                      Problem <strong>{selectedOther.problem_fit ?? 0}%</strong>
                    </span>
                    <span>
                      Seeking{" "}
                      <strong>{selectedOther.solution_seeking ?? 0}%</strong>
                    </span>
                    <span>
                      Buying{" "}
                      <strong>{selectedOther.buying_intent ?? 0}%</strong>
                    </span>
                  </div>
                  <small>
                    Evidence: {selectedOther.matched_phrases.join(", ")}
                  </small>
                  {selectedOther.source_query ? (
                    <small>Found through: {selectedOther.source_query}</small>
                  ) : null}
                </div>
                <CandidateReviewControls
                  accessToken={accessToken ?? ""}
                  candidate={selectedOther}
                  onSaved={(review) =>
                    setOtherMatches((current) =>
                      current.map((candidate) =>
                        candidate.id === selectedOther.id
                          ? { ...candidate, human_review: review }
                          : candidate,
                      ),
                    )
                  }
                />
                <div className="conversation-detail-actions">
                  <a
                    className="primary-action"
                    href={selectedOther.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source
                  </a>
                </div>
                <p className="manual-reply-note">
                  AI ranked this result lower. Review it manually before
                  deciding whether it is useful.
                </p>
              </>
            ) : null}
          </section>
        </div>
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
  onScan,
  onAddProduct,
  localRuntime,
  latestScan,
}: {
  usage: UsageSummary | null;
  products: Product[];
  onNavigate: (view: "products" | "opportunities" | "analytics") => void;
  onScan: () => void;
  onAddProduct: () => void;
  localRuntime: boolean;
  latestScan: ScanRun | null;
}) {
  if (localRuntime) {
    const listeningPhraseCount = products.reduce(
      (total, product) => total + product.keywords.length,
      0,
    );
    const hasProducts = products.length > 0;
    return (
      <section className="overview-workspace" aria-labelledby="overview-title">
        <div className="overview-hero">
          <div>
            <p className="page-kicker">
              {hasProducts ? "Ready for discovery" : "Start here"}
            </p>
            <h2 id="overview-title">
              {hasProducts
                ? "Find your next customer conversation"
                : "Set up your first product"}
            </h2>
            <p>
              {hasProducts
                ? "Run a supervised scan when you are ready. Mentionish will rank the results and explain why each conversation may matter."
                : "Describe what you are building and Mentionish will help create focused listening phrases for Reddit and Hacker News."}
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={hasProducts ? onScan : onAddProduct}
          >
            <AppIcon name={hasProducts ? "scan" : "plus"} />
            {hasProducts ? "Start scan" : "Add first product"}
          </button>
        </div>
        <div className="metrics-grid">
          <article className="metric-card">
            <span>Active products</span>
            <strong>{products.length}</strong>
            <p>Ready for focused discovery</p>
          </article>
          <article className="metric-card">
            <span>Listening phrases</span>
            <strong>{listeningPhraseCount}</strong>
            <p>Approved customer-language searches</p>
          </article>
          <article className="metric-card">
            <span>Discovery sources</span>
            <strong>2</strong>
            <p>Reddit primary · Hacker News fallback</p>
          </article>
        </div>
        <div className="home-workflow-grid">
          <section className="home-next-step">
            <p className="page-kicker">Next step</p>
            <h3>
              {hasProducts
                ? "Run discovery, then review the strongest matches"
                : "Create the context discovery needs"}
            </h3>
            <ol>
              <li className={hasProducts ? "step-done" : "step-current"}>
                <span>{hasProducts ? "✓" : "1"}</span>
                Add product context and listening phrases
              </li>
              <li className={hasProducts ? "step-current" : ""}>
                <span>2</span>
                Start a supervised Reddit + Hacker News scan
              </li>
              <li>
                <span>3</span>
                Review ranked conversations and reply manually
              </li>
            </ol>
          </section>
          <section className="home-last-scan">
            <p className="page-kicker">Latest discovery</p>
            {latestScan ? (
              <>
                <h3>
                  {latestScan.status === "succeeded"
                    ? `${latestScan.candidates_qualified} qualified conversations`
                    : latestScan.status === "failed"
                      ? "The last scan needs attention"
                      : "Discovery is in progress"}
                </h3>
                <p>
                  {latestScan.items_fetched} items reviewed ·{" "}
                  {latestScan.candidates_matched} AI candidates ·{" "}
                  {latestScan.opportunities_found} new
                </p>
                <button
                  className="secondary-action small-action"
                  type="button"
                  onClick={() => onNavigate("opportunities")}
                >
                  Review conversations
                </button>
              </>
            ) : (
              <>
                <h3>No scans yet</h3>
                <p>
                  Your first supervised scan will show coverage and matching
                  quality here.
                </p>
              </>
            )}
          </section>
        </div>
        <section className="home-privacy-note">
          <div>
            <span className="health-dot" />
            <strong>Local workspace</strong>
          </div>
          <p>
            Products, results, and provider settings remain on this device.
            Scans run only when you start them.
          </p>
        </section>
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
  const [candidateEvaluation, setCandidateEvaluation] =
    useState<CandidateEvaluationSummary | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setAnalyticsLoading(true);
    setError(null);
    Promise.all([
      getAnalytics(accessToken, {
        ...(productId ? { productId } : {}),
        window: windowValue,
      }),
      listScans(accessToken).catch(() => []),
      getCandidateEvaluation(accessToken, {
        ...(productId ? { productId } : {}),
        window: windowValue,
      }).catch(() => null),
    ])
      .then(([summary, scans, evaluation]) => {
        if (active) {
          setData(summary);
          setCandidateEvaluation(evaluation);
          setScanHistory(
            scans
              .filter(
                (scan) => !productId || scan.product_ids.includes(productId),
              )
              .slice(0, 8),
          );
        }
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

  async function downloadEvaluation() {
    if (!accessToken) return;
    setError(null);
    try {
      const exported = await exportCandidateEvaluation(
        accessToken,
        productId || undefined,
      );
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mentionish-quality-evaluation-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

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
          <section className="feedback-quality-panel">
            <div>
              <h3>Discovery quality</h3>
              <p>
                Your latest rating per conversation in the last{" "}
                {data.window_days}
                days.
              </p>
            </div>
            <div className="feedback-quality-stat">
              <span>Reviewed</span>
              <strong>{data.feedback.reviewed}</strong>
            </div>
            <div className="feedback-quality-stat">
              <span>Useful</span>
              <strong>{data.feedback.useful}</strong>
            </div>
            <div className="feedback-quality-stat">
              <span>Useful rate</span>
              <strong>{data.feedback.useful_percent}%</strong>
            </div>
            <div className="feedback-quality-stat feedback-quality-issue">
              <span>Top issue</span>
              <strong>
                {data.feedback.top_negative_reason
                  ? feedbackReasonLabel(data.feedback.top_negative_reason)
                  : "No negative feedback"}
              </strong>
            </div>
          </section>
          {candidateEvaluation ? (
            <section className="evaluation-quality-panel">
              <div className="evaluation-quality-heading">
                <div>
                  <h3>AI decision evaluation</h3>
                  <p>
                    Human labels from reviewed scan candidates. No automatic
                    threshold changes.
                  </p>
                </div>
                <button
                  className="secondary-action small-action"
                  type="button"
                  disabled={candidateEvaluation.reviewed === 0}
                  onClick={() => void downloadEvaluation()}
                >
                  Export sanitized data
                </button>
              </div>
              <div className="evaluation-quality-stats">
                <div>
                  <span>Reviewed</span>
                  <strong>{candidateEvaluation.reviewed}</strong>
                </div>
                <div>
                  <span>Exact agreement</span>
                  <strong>
                    {candidateEvaluation.reviewed
                      ? `${candidateEvaluation.exact_accuracy_percent}%`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Actionable precision</span>
                  <strong>
                    {candidateEvaluation.actionable_predictions
                      ? `${candidateEvaluation.actionable_precision_percent}%`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Actionable recall</span>
                  <strong>
                    {candidateEvaluation.human_actionable
                      ? `${candidateEvaluation.actionable_recall_percent}%`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>False positives</span>
                  <strong>{candidateEvaluation.false_positives}</strong>
                </div>
                <div>
                  <span>False negatives</span>
                  <strong>{candidateEvaluation.false_negatives}</strong>
                </div>
              </div>
            </section>
          ) : null}
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
          <section
            className="activity-history"
            aria-labelledby="scan-history-title"
          >
            <div className="panel-heading">
              <div>
                <h3 id="scan-history-title">Recent discovery runs</h3>
                <p>Coverage and outcomes from your latest supervised scans.</p>
              </div>
              <span className="result-count">{scanHistory.length} shown</span>
            </div>
            {scanHistory.length > 0 ? (
              <div className="activity-run-list">
                {scanHistory.map((scan, index) => (
                  <article key={scan.id}>
                    <div className="activity-run-title">
                      <span
                        className={`activity-status activity-${scan.status}`}
                      >
                        {scan.status}
                      </span>
                      <strong>
                        Discovery run {scanHistory.length - index}
                      </strong>
                      <small>
                        {scan.scope === "all" ? "All products" : "One product"}
                      </small>
                    </div>
                    <div className="activity-run-stats">
                      <span>
                        <strong>{scan.items_fetched}</strong> reviewed
                      </span>
                      <span>
                        <strong>{scan.candidates_matched}</strong> AI candidates
                      </span>
                      <span>
                        <strong>{scan.candidates_qualified}</strong> qualified
                      </span>
                      <span>
                        <strong>{scan.opportunities_found}</strong> new
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="activity-empty">
                No completed discovery runs to show yet.
              </p>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const localRuntime = isLocalRuntime();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const workspaceView = workspaceViewFromPath(pathname);
  const [email, setEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const conversationProductId = searchParams.get("product") ?? undefined;
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [saveReady, setSaveReady] = useState(false);
  const setupModalRef = useRef<HTMLElement>(null);
  const setupTriggerRef = useRef<HTMLElement | null>(null);
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
  const [savedPhraseDetails, setSavedPhraseDetails] = useState<SavedPhrase[]>(
    [],
  );
  const [suggesting, setSuggesting] = useState(false);
  const [contextSuggestion, setContextSuggestion] =
    useState<ProductContextEnhancement | null>(null);
  const [enhancingContext, setEnhancingContext] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [redditVerified, setRedditVerified] = useState(false);
  const [bulkPhraseEdit, setBulkPhraseEdit] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const [selectedVoiceRules, setSelectedVoiceRules] = useState<string[]>([]);
  const [activeScan, setActiveScan] = useState<ScanRun | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ScanCandidateAudit[]>(
    [],
  );
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  function navigateTo(view: WorkspaceView) {
    router.push(workspacePaths[view]);
  }

  useEffect(() => {
    let active = true;

    async function loadWithToken(token: string, ownerLabel: string) {
      if (!active) return;
      setAccessToken(token);
      setEmail(ownerLabel);
      try {
        const [
          loadedProducts,
          loadedArchivedProducts,
          loadedUsage,
          loadedScans,
        ] = await Promise.all([
          listProducts(token),
          listArchivedProducts(token),
          getUsage(token),
          localRuntime
            ? listScans(token).catch(() => [] as ScanRun[])
            : Promise.resolve([] as ScanRun[]),
        ]);
        if (!active) return;
        setProducts(loadedProducts);
        setArchivedProducts(loadedArchivedProducts);
        setUsage(loadedUsage);
        setActiveScan(loadedScans[0] ?? null);
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
  const phraseEntries = keywords.map((phrase, index) => ({
    phrase,
    index,
    kind:
      phraseSuggestions.find(
        (suggestion) =>
          suggestion.phrase.trim().toLocaleLowerCase() ===
          phrase.toLocaleLowerCase(),
      )?.kind ??
      savedPhraseDetails.find(
        (saved) =>
          saved.phrase.trim().toLocaleLowerCase() ===
          phrase.toLocaleLowerCase(),
      )?.kind ??
      inferPhraseKind(phrase),
  }));
  const phraseCoverage = phraseSuggestionGroups.map((group) => ({
    ...group,
    count: phraseEntries.filter((entry) => entry.kind === group.kind).length,
  }));
  const coveredPhraseKinds = phraseCoverage.filter(
    (group) => group.count > 0,
  ).length;
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

  useEffect(() => {
    if (!formOpen || !accessToken) return;
    let active = true;
    void Promise.all([
      getAiSettings(accessToken).catch(() => null),
      getRedditConfiguration(accessToken).catch(() => null),
    ]).then(([ai, reddit]) => {
      if (!active) return;
      setAiConfigured(ai?.configured ?? false);
      setRedditVerified(
        Boolean(reddit?.verified_account && !reddit.kill_switch),
      );
    });
    return () => {
      active = false;
    };
  }, [accessToken, formOpen]);

  function openCreate() {
    setupTriggerRef.current = document.activeElement as HTMLElement | null;
    setEditingId(null);
    setForm(emptyForm);
    setStep(1);
    setFormError(null);
    setNotice(null);
    setContextSuggestion(null);
    setPhraseSuggestions([]);
    setSavedPhraseDetails([]);
    setBulkPhraseEdit(false);
    setNewPhrase("");
    setSelectedVoiceRules([]);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setupTriggerRef.current = document.activeElement as HTMLElement | null;
    setEditingId(product.id);
    setForm(formFromProduct(product));
    setStep(1);
    setFormError(null);
    setNotice(null);
    setContextSuggestion(null);
    setPhraseSuggestions([]);
    setSavedPhraseDetails(product.phrases ?? []);
    setBulkPhraseEdit(false);
    setNewPhrase("");
    setSelectedVoiceRules(
      voicePresets
        .filter((preset) =>
          (product.voice_persona ?? "").includes(preset.guidance),
        )
        .map((preset) => preset.id),
    );
    setFormOpen(true);
  }

  function closeForm() {
    if (pending === "save") return;
    const editingProduct = products.find((product) => product.id === editingId);
    const baseline = editingProduct
      ? formFromProduct(editingProduct)
      : emptyForm;
    const dirty = Object.keys(form).some(
      (key) =>
        form[key as keyof ProductFormState] !==
        baseline[key as keyof ProductFormState],
    );
    if (
      dirty &&
      !window.confirm("Discard the changes you made to this product?")
    )
      return;
    setFormOpen(false);
    setFormError(null);
    window.setTimeout(() => setupTriggerRef.current?.focus(), 0);
  }

  function handleModalKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeForm();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
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

  async function improveProductContext() {
    if (!accessToken) return;
    const validationError = validateStep(1);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setEnhancingContext(true);
    setFormError(null);
    try {
      const result = await enhanceProductContext(accessToken, {
        name: form.name.trim(),
        description: form.description.trim(),
        audience: form.audience.trim() || null,
        discoveryProfile: form.discoveryProfile,
        listeningPhrases: keywords,
      });
      setContextSuggestion(result);
      setAiConfigured(true);
    } catch (caught) {
      setFormError(messageFor(caught));
    } finally {
      setEnhancingContext(false);
    }
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
        discoveryProfile: form.discoveryProfile,
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
    if (
      existing.some(
        (phrase) =>
          phrase.toLocaleLowerCase() === suggestion.phrase.toLocaleLowerCase(),
      )
    )
      return;
    setForm({ ...form, keywords: [...existing, suggestion.phrase].join("\n") });
  }

  function useRecommendedPhraseSet() {
    const recommended = parseKeywordInput(
      [...keywords, ...phraseSuggestions.map(({ phrase }) => phrase)].join(
        "\n",
      ),
    ).slice(0, 25);
    setForm({ ...form, keywords: recommended.join("\n") });
    setNotice(
      `Added a balanced set. ${recommended.length} phrases are now ready for review.`,
    );
  }

  function updatePhrase(index: number, value: string) {
    const next = [...keywords];
    next[index] = value;
    setForm({ ...form, keywords: next.join("\n") });
  }

  function removePhrase(index: number) {
    setForm({
      ...form,
      keywords: keywords
        .filter((_, itemIndex) => itemIndex !== index)
        .join("\n"),
    });
  }

  function addCustomPhrase() {
    const phrase = parseKeywordInput(newPhrase)[0];
    if (
      !phrase ||
      keywords.some(
        (existing) =>
          existing.toLocaleLowerCase() === phrase.toLocaleLowerCase(),
      ) ||
      keywords.length >= 25
    )
      return;
    setForm({ ...form, keywords: [...keywords, phrase].join("\n") });
    setNewPhrase("");
  }

  function toggleVoiceRule(ruleId: string) {
    const next = selectedVoiceRules.includes(ruleId)
      ? selectedVoiceRules.filter((id) => id !== ruleId)
      : [...selectedVoiceRules, ruleId];
    setSelectedVoiceRules(next);
    const guidance = voicePresets
      .filter((preset) => next.includes(preset.id))
      .map((preset) => preset.guidance)
      .join(" ");
    setForm({ ...form, voicePersona: guidance });
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
      discovery_profile: form.discoveryProfile,
      keywords,
      phrases: phraseEntries.map(({ phrase, kind }) => {
        const suggested = phraseSuggestions.find(
          (item) =>
            item.phrase.trim().toLocaleLowerCase() ===
            phrase.toLocaleLowerCase(),
        );
        const saved = savedPhraseDetails.find(
          (item) =>
            item.phrase.trim().toLocaleLowerCase() ===
            phrase.toLocaleLowerCase(),
        );
        return {
          phrase,
          kind,
          source: suggested ? "ai_suggested" : (saved?.source ?? "manual"),
          rationale: suggested?.rationale ?? saved?.rationale ?? null,
        };
      }),
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
      window.setTimeout(() => setupTriggerRef.current?.focus(), 0);
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
  async function beginScan(
    productId?: string,
    mode: "standard" | "deep" = "standard",
  ) {
    if (!accessToken) return;
    setScanError(null);
    setNotice(null);
    setAuditOpen(false);
    setScanCandidates([]);
    try {
      const started = await startScan(accessToken, productId, mode);
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
          <div>
            <strong>Mentionish</strong>
            <span>Local discovery</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          <Link
            className={
              workspaceView === "overview"
                ? "nav-item nav-item-active"
                : "nav-item"
            }
            href={workspacePaths.overview}
          >
            <span className="nav-glyph">
              <AppIcon name="home" />
            </span>
            Home
          </Link>
          <Link
            className={`nav-item ${workspaceView === "products" ? "nav-item-active" : ""}`}
            href={workspacePaths.products}
          >
            <span className="nav-glyph">
              <AppIcon name="products" />
            </span>
            Products
          </Link>
          <Link
            className={`nav-item ${workspaceView === "opportunities" ? "nav-item-active" : ""}`}
            href={workspacePaths.opportunities}
          >
            <span className="nav-glyph">
              <AppIcon name="conversations" />
            </span>
            Conversations
          </Link>
          <Link
            className={
              workspaceView === "analytics"
                ? "nav-item nav-item-active"
                : "nav-item"
            }
            href={workspacePaths.analytics}
          >
            <span className="nav-glyph">
              <AppIcon name="activity" />
            </span>
            Activity
          </Link>

          <div className="nav-separator" />
          <Link
            className={`nav-item ${workspaceView === "settings" ? "nav-item-active" : ""}`}
            href={workspacePaths.settings}
          >
            <span className="nav-glyph">
              <AppIcon name="settings" />
            </span>
            Settings
          </Link>
        </nav>

        <div className="source-health">
          <div className="source-health-heading">
            <span className="health-dot" />
            Sources ready
          </div>
          <p>Reddit + Hacker News</p>
          <span>Supervised discovery only</span>
        </div>

        <div className="sidebar-account">
          <span className="sidebar-avatar" aria-hidden="true">
            {initials(email)}
          </span>
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
          <div className="page-heading">
            <p className="page-kicker">
              {workspaceMeta[workspaceView].eyebrow}
            </p>
            <h1>{workspaceMeta[workspaceView].title}</h1>
            <p>{workspaceMeta[workspaceView].description}</p>
          </div>
          {workspaceView === "products" ? (
            <div className="topbar-actions">
              {localRuntime ? (
                <>
                  <button
                    className="secondary-action"
                    type="button"
                    title="Search the last 30 days with a fresh adaptive plan"
                    disabled={
                      Boolean(
                        activeScan &&
                        ["pending", "running", "cancelling"].includes(
                          activeScan.status,
                        ),
                      ) || products.length === 0
                    }
                    onClick={() => void beginScan(undefined, "deep")}
                  >
                    Deep scan
                  </button>
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
                    <AppIcon name="scan" />
                    Scan all
                  </button>
                </>
              ) : null}
              <button
                className="primary-action"
                type="button"
                onClick={openCreate}
              >
                <AppIcon name="plus" />
                New product
              </button>
            </div>
          ) : null}
        </header>

        <div className="app-content">
          {localRuntime &&
          activeScan &&
          (workspaceView === "products" ||
            (workspaceView === "overview" &&
              ["pending", "running", "cancelling"].includes(
                activeScan.status,
              ))) ? (
            <ScanStatusPanel
              scan={activeScan}
              auditLoading={auditLoading}
              auditOpen={auditOpen}
              onCancel={() => void stopScan()}
              onReviewDecisions={() => void reviewScanDecisions()}
              onViewConversations={() => navigateTo("opportunities")}
            />
          ) : null}
          {localRuntime &&
          activeScan &&
          auditOpen &&
          workspaceView === "products" ? (
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
                          className={`audit-decision audit-${candidate.discovery_tier}`}
                        >
                          {discoveryTierLabel(candidate.discovery_tier)}
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
                          Evidence: {candidate.matched_phrases.join(", ")}
                        </span>
                        <a
                          href={candidate.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source
                        </a>
                      </div>
                      <CandidateReviewControls
                        accessToken={accessToken ?? ""}
                        candidate={candidate}
                        onSaved={(review) =>
                          setScanCandidates((current) =>
                            current.map((item) =>
                              item.id === candidate.id
                                ? { ...item, human_review: review }
                                : item,
                            ),
                          )
                        }
                      />
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

              <section
                className="product-readiness-strip"
                aria-label="Discovery readiness"
              >
                <div>
                  <span className="health-dot" />
                  <div>
                    <strong>
                      {products.length > 0
                        ? `${products.length} ${products.length === 1 ? "product" : "products"} ready`
                        : "Discovery setup"}
                    </strong>
                    <span>
                      {products.length > 0
                        ? `${keywordCount} approved listening phrases`
                        : "Add a product to begin discovering conversations"}
                    </span>
                  </div>
                </div>
                <div className="readiness-sources">
                  <span>Reddit · supervised</span>
                  <span>Hacker News · ready</span>
                </div>
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
                  <div className="product-card-list">
                    {products.map((product) => {
                      const productScan =
                        activeScan?.scope === "product" &&
                        activeScan.product_ids.includes(product.id)
                          ? activeScan
                          : null;
                      return (
                        <article className="product-card" key={product.id}>
                          <div className="product-card-main">
                            <span className="product-monogram">
                              {product.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="product-card-copy">
                              <div>
                                <h3>{product.name}</h3>
                                <span className="readiness-badge">
                                  <span className="health-dot" /> Ready
                                </span>
                              </div>
                              <p>{product.description}</p>
                              <div className="product-card-meta">
                                <span>
                                  <strong>{product.keywords.length}</strong>{" "}
                                  listening phrases
                                </span>
                                <span>Reddit + Hacker News</span>
                                <time dateTime={product.updated_at}>
                                  Updated{" "}
                                  {new Date(
                                    product.updated_at,
                                  ).toLocaleDateString()}
                                </time>
                              </div>
                              {productScan?.status === "succeeded" ? (
                                <p className="product-latest-result">
                                  Latest scan found{" "}
                                  <strong>
                                    {productScan.opportunities_found} new
                                  </strong>{" "}
                                  conversations.
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="product-card-actions">
                            <button
                              className="primary-action small-action"
                              type="button"
                              onClick={() => {
                                router.push(
                                  `${workspacePaths.opportunities}?product=${encodeURIComponent(product.id)}`,
                                );
                              }}
                            >
                              View results
                            </button>
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
                                <AppIcon name="scan" />
                                Scan
                              </button>
                            ) : null}
                            <details className="action-menu">
                              <summary
                                aria-label={`More actions for ${product.name}`}
                              >
                                •••
                              </summary>
                              <div>
                                <button
                                  type="button"
                                  disabled={pending !== null}
                                  onClick={() => openEdit(product)}
                                >
                                  Edit product
                                </button>
                                <button
                                  className="text-danger"
                                  type="button"
                                  disabled={pending !== null}
                                  onClick={() => void removeProduct(product)}
                                >
                                  Archive product
                                </button>
                              </div>
                            </details>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {archivedProducts.length > 0 ? (
                <section className="archived-products">
                  <button
                    className="archived-products-toggle"
                    type="button"
                    aria-expanded={archivedOpen}
                    onClick={() => setArchivedOpen((current) => !current)}
                  >
                    <span>{archivedOpen ? "−" : "+"}</span>
                    Archived products
                    <strong>{archivedProducts.length}</strong>
                  </button>
                  {archivedOpen ? (
                    <div className="archived-product-list">
                      {archivedProducts.map((product) => (
                        <article key={product.id}>
                          <div className="product-identity">
                            <span className="product-monogram">
                              {product.name.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <h3>{product.name}</h3>
                              <p>
                                {product.keywords.length} saved phrases ·
                                Recoverable for 30 days
                              </p>
                            </div>
                          </div>
                          <button
                            className="secondary-action small-action"
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void restoreArchivedProduct(product)}
                          >
                            {pending === "restore" ? "Restoring…" : "Restore"}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : workspaceView === "overview" ? (
            <OverviewPanel
              usage={usage}
              products={products}
              onNavigate={navigateTo}
              onScan={() => void beginScan()}
              onAddProduct={openCreate}
              localRuntime={localRuntime}
              latestScan={activeScan}
            />
          ) : workspaceView === "analytics" ? (
            <AnalyticsPanel accessToken={accessToken} products={products} />
          ) : workspaceView === "settings" ? (
            <WorkspaceSettings accessToken={accessToken} />
          ) : (
            <OpportunitiesPanel
              accessToken={accessToken}
              products={products}
              usage={usage}
              {...(conversationProductId
                ? { initialProductId: conversationProductId }
                : {})}
              onProductChange={(productId) =>
                router.replace(
                  `${workspacePaths.opportunities}?product=${encodeURIComponent(productId)}`,
                )
              }
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
            onKeyDown={handleModalKeyDown}
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
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <ol className="setup-progress">
              {["Product", "Discovery", "Reply style"].map((label, index) => {
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
                    <span>{number < step ? "✓" : number}</span>
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
                  <legend>Product context</legend>
                  <p className="field-intro">
                    Give discovery enough factual context to recognize the right
                    problems and people.
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
                  <div className="field-ai-actions">
                    <span>
                      AI preserves your facts and proposes clearer discovery
                      context. Nothing is applied automatically.
                    </span>
                    <button
                      className="secondary-action small-action"
                      type="button"
                      disabled={
                        enhancingContext ||
                        form.name.trim().length === 0 ||
                        form.description.trim().length < 20
                      }
                      onClick={() => void improveProductContext()}
                    >
                      {enhancingContext ? "Improving..." : "Improve with AI"}
                    </button>
                  </div>
                  {contextSuggestion ? (
                    <section
                      className="ai-review-card"
                      aria-label="Improved description suggestion"
                    >
                      <div className="ai-review-heading">
                        <div>
                          <span>AI suggestion</span>
                          <strong>Clearer product description</strong>
                        </div>
                        <button
                          type="button"
                          aria-label="Dismiss description suggestion"
                          onClick={() => setContextSuggestion(null)}
                        >
                          ×
                        </button>
                      </div>
                      <p>{contextSuggestion.description}</p>
                      <div className="discovery-profile-preview">
                        {discoveryProfileGroups.map((group) => {
                          const values =
                            contextSuggestion.discovery_profile[group.key];
                          if (values.length === 0) return null;
                          return (
                            <div key={group.key}>
                              <strong>{group.label}</strong>
                              <span>{values.join(" · ")}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="ai-review-actions">
                        <button
                          className="primary-action small-action"
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              description: contextSuggestion.description,
                              audience:
                                form.audience.trim() ||
                                contextSuggestion.audience_options[0] ||
                                "",
                              discoveryProfile:
                                contextSuggestion.discovery_profile,
                            })
                          }
                        >
                          Apply complete profile
                        </button>
                        <button
                          className="secondary-action small-action"
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              description: contextSuggestion.description,
                            })
                          }
                        >
                          Use description
                        </button>
                        <button
                          className="secondary-action small-action"
                          type="button"
                          disabled={enhancingContext}
                          onClick={() => void improveProductContext()}
                        >
                          Try again
                        </button>
                      </div>
                    </section>
                  ) : null}
                  {form.discoveryProfile && !contextSuggestion ? (
                    <div className="approved-profile-status">
                      <span aria-hidden="true">✓</span>
                      <div>
                        <strong>Discovery profile approved</strong>
                        <span>
                          Queries and classification will use structured pains,
                          intent signals, exclusions, and communities.
                        </span>
                      </div>
                    </div>
                  ) : null}
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
                  {contextSuggestion ? (
                    <section
                      className="audience-suggestions"
                      aria-label="Ideal customer suggestions"
                    >
                      <div>
                        <strong>
                          {form.audience.trim()
                            ? "Improve the audience"
                            : "Choose an ideal customer"}
                        </strong>
                        <span>Pick one, then edit it if needed.</span>
                      </div>
                      {contextSuggestion.audience_options.map((audience) => (
                        <button
                          type="button"
                          key={audience}
                          onClick={() => setForm({ ...form, audience })}
                        >
                          <span>{audience}</span>
                          <strong>Use</strong>
                        </button>
                      ))}
                    </section>
                  ) : (
                    <div className="field-ai-actions audience-ai-action">
                      <span>
                        {aiConfigured === false
                          ? "Configure an AI provider in Settings to generate an audience."
                          : "AI can suggest audiences from the product description."}
                      </span>
                      <button
                        className="secondary-action small-action"
                        type="button"
                        disabled={
                          enhancingContext ||
                          form.name.trim().length === 0 ||
                          form.description.trim().length < 20
                        }
                        onClick={() => void improveProductContext()}
                      >
                        {enhancingContext
                          ? "Generating..."
                          : form.audience.trim()
                            ? "Improve audience"
                            : "Suggest audience"}
                      </button>
                    </div>
                  )}
                </fieldset>
              ) : null}

              {step === 2 ? (
                <fieldset>
                  <legend>Choose what to listen for</legend>
                  <p className="field-intro">
                    Build a balanced search set from real customer language.
                    Mentionish expands these into broader searches during a
                    scan.
                  </p>
                  <div className="phrase-ai-toolbar">
                    <div>
                      <strong>Generate a stronger discovery set</strong>
                      <span>
                        AI proposes phrases across five useful intent groups.
                        You choose what is added.
                      </span>
                    </div>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={suggesting}
                      onClick={() => void generatePhraseSuggestions()}
                    >
                      {suggesting ? "Generating..." : "Generate balanced set"}
                    </button>
                  </div>

                  <div className="phrase-coverage" aria-label="Phrase coverage">
                    <div className="phrase-coverage-heading">
                      <strong>Discovery coverage</strong>
                      <span>
                        {coveredPhraseKinds}/5 groups · {keywords.length}/25
                        phrases
                      </span>
                    </div>
                    <div className="phrase-coverage-chips">
                      {phraseCoverage.map((group) => (
                        <span
                          className={group.count > 0 ? "is-covered" : undefined}
                          key={group.kind}
                          title={group.description}
                        >
                          {group.label} <strong>{group.count}</strong>
                        </span>
                      ))}
                    </div>
                    {coveredPhraseKinds < 3 ? (
                      <p>
                        Add phrases from at least three groups for broader, more
                        useful results.
                      </p>
                    ) : null}
                  </div>

                  {phraseSuggestions.length > 0 ? (
                    <div
                      className="phrase-suggestions"
                      aria-label="AI phrase suggestions"
                    >
                      <div className="phrase-suggestion-actions">
                        <span>
                          Focused on pains, help requests, tool searches, and
                          core workflows.
                        </span>
                        <button
                          type="button"
                          className="secondary-action small-action"
                          onClick={useRecommendedPhraseSet}
                        >
                          Add balanced set
                        </button>
                      </div>
                      {phraseSuggestionGroups.map((group) => {
                        const suggestions = phraseSuggestions.filter(
                          (suggestion) => suggestion.kind === group.kind,
                        );
                        if (suggestions.length === 0) return null;
                        return (
                          <section
                            className="phrase-suggestion-group"
                            key={group.kind}
                            aria-labelledby={`suggestion-${group.kind}`}
                          >
                            <div className="phrase-suggestion-group-heading">
                              <div>
                                <strong id={`suggestion-${group.kind}`}>
                                  {group.label}
                                </strong>
                                <span>{group.description}</span>
                              </div>
                              <span>{suggestions.length}</span>
                            </div>
                            {suggestions.map((suggestion) => {
                              const added = keywords.some(
                                (phrase) =>
                                  phrase.toLocaleLowerCase() ===
                                  suggestion.phrase.toLocaleLowerCase(),
                              );
                              return (
                                <article
                                  key={`${suggestion.kind}:${suggestion.phrase}`}
                                >
                                  <div>
                                    <strong>{suggestion.phrase}</strong>
                                    <p>{suggestion.rationale}</p>
                                  </div>
                                  <button
                                    type="button"
                                    className="secondary-action small-action"
                                    disabled={added || keywords.length >= 25}
                                    onClick={() =>
                                      addSuggestedPhrase(suggestion)
                                    }
                                  >
                                    {added ? "Added" : "Add"}
                                  </button>
                                </article>
                              );
                            })}
                          </section>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="field-heading">
                    <label htmlFor="new-customer-phrase">
                      Approved phrases
                    </label>
                    <span>12–20 recommended</span>
                  </div>
                  <div className="add-phrase-row">
                    <input
                      id="new-customer-phrase"
                      autoFocus
                      maxLength={80}
                      value={newPhrase}
                      onChange={(event) => setNewPhrase(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomPhrase();
                        }
                      }}
                      placeholder="Add a customer phrase"
                    />
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={!newPhrase.trim() || keywords.length >= 25}
                      onClick={addCustomPhrase}
                    >
                      Add
                    </button>
                  </div>

                  <div className="approved-phrase-groups">
                    {phraseSuggestionGroups.map((group) => {
                      const entries = phraseEntries.filter(
                        (entry) => entry.kind === group.kind,
                      );
                      if (entries.length === 0) return null;
                      return (
                        <section key={group.kind}>
                          <div className="approved-group-heading">
                            <div>
                              <strong>{group.label}</strong>
                              <span>{group.description}</span>
                            </div>
                            <span>{entries.length}</span>
                          </div>
                          {entries.map((entry) => (
                            <div
                              className="approved-phrase-row"
                              key={`${entry.index}:${entry.phrase}`}
                            >
                              <input
                                aria-label={`Edit phrase: ${entry.phrase}`}
                                maxLength={80}
                                value={entry.phrase}
                                onChange={(event) =>
                                  updatePhrase(entry.index, event.target.value)
                                }
                              />
                              <button
                                type="button"
                                aria-label={`Remove phrase: ${entry.phrase}`}
                                onClick={() => removePhrase(entry.index)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </section>
                      );
                    })}
                    {keywords.length === 0 ? (
                      <div className="phrase-empty-state">
                        <strong>No phrases yet</strong>
                        <span>
                          Add one above or generate a balanced set with AI.
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <button
                    className="bulk-editor-toggle"
                    type="button"
                    aria-expanded={bulkPhraseEdit}
                    onClick={() => setBulkPhraseEdit((current) => !current)}
                  >
                    {bulkPhraseEdit ? "Hide bulk editor" : "Advanced bulk edit"}
                  </button>
                  {bulkPhraseEdit ? (
                    <textarea
                      id="product-keywords"
                      required
                      rows={7}
                      value={form.keywords}
                      onChange={(event) =>
                        setForm({ ...form, keywords: event.target.value })
                      }
                      aria-label="Bulk edit customer phrases"
                      placeholder={
                        "reduce customer churn\ncustomer retention software\nwhy are users cancelling"
                      }
                    />
                  ) : null}
                  <div className="example-box">
                    <strong>Good sets combine specific and broad intent</strong>
                    <span>
                      Aim for multiple pains and help requests, plus a few
                      comparisons, workflows, and audience phrases. You can
                      refine this after reviewing scan results.
                    </span>
                  </div>
                </fieldset>
              ) : null}

              {step === 3 ? (
                <fieldset>
                  <legend>Set your response style</legend>
                  <p className="field-intro">
                    Choose reusable guardrails for draft generation. Every reply
                    remains reviewable and manual-only.
                  </p>
                  <div className="field-heading">
                    <label>Quick style rules</label>
                    <span>{selectedVoiceRules.length} selected</span>
                  </div>
                  <div className="voice-preset-grid">
                    {voicePresets.map((preset) => {
                      const selected = selectedVoiceRules.includes(preset.id);
                      return (
                        <button
                          className={selected ? "is-selected" : undefined}
                          type="button"
                          aria-pressed={selected}
                          key={preset.id}
                          onClick={() => toggleVoiceRule(preset.id)}
                        >
                          <span aria-hidden="true">{selected ? "✓" : "+"}</span>
                          <div>
                            <strong>{preset.label}</strong>
                            <small>{preset.guidance}</small>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="field-heading">
                    <label htmlFor="voice-persona">
                      Advanced guidance{" "}
                      <span className="optional">(optional)</span>
                    </label>
                    <span>{form.voicePersona.length}/1000</span>
                  </div>
                  <textarea
                    id="voice-persona"
                    maxLength={1000}
                    rows={4}
                    value={form.voicePersona}
                    onChange={(event) => {
                      const voicePersona = event.target.value;
                      setForm({ ...form, voicePersona });
                      setSelectedVoiceRules(
                        voicePresets
                          .filter((preset) =>
                            voicePersona.includes(preset.guidance),
                          )
                          .map((preset) => preset.id),
                      );
                    }}
                    placeholder="Helpful and direct. Share practical detail before mentioning the product. Avoid sales language."
                  />
                  <div className="setup-summary">
                    <span className="summary-mark">M</span>
                    <div>
                      <strong>Review your discovery setup</strong>
                      <p>
                        {form.name || "Your product"} will track{" "}
                        {keywords.length}{" "}
                        {keywords.length === 1 ? "phrase" : "phrases"} on Hacker
                        News
                        {redditVerified
                          ? " and your verified Reddit browser profile."
                          : ". Reddit can be added after its browser profile is verified."}
                      </p>
                    </div>
                  </div>
                  <div className="setup-readiness-grid">
                    <span>
                      <AppIcon name="check" />
                      Product context complete
                    </span>
                    <span
                      className={
                        !form.audience.trim() ? "needs-attention" : undefined
                      }
                    >
                      {form.audience.trim() ? (
                        <AppIcon name="check" />
                      ) : (
                        <b>!</b>
                      )}
                      {form.audience.trim()
                        ? "Ideal customer defined"
                        : "Ideal customer not defined"}
                    </span>
                    <span
                      className={
                        coveredPhraseKinds < 3 ? "needs-attention" : undefined
                      }
                    >
                      {coveredPhraseKinds >= 3 ? (
                        <AppIcon name="check" />
                      ) : (
                        <b>!</b>
                      )}
                      {keywords.length} phrases · {coveredPhraseKinds}/5 groups
                    </span>
                    <span
                      className={
                        !redditVerified ? "needs-attention" : undefined
                      }
                    >
                      {redditVerified ? <AppIcon name="check" /> : <b>!</b>}
                      {redditVerified
                        ? "Reddit verified · supervised"
                        : "Reddit needs setup"}
                    </span>
                    <span>
                      <AppIcon name="check" />
                      Hacker News ready
                    </span>
                    <span>
                      <AppIcon name="check" />
                      {form.voicePersona.trim()
                        ? "Custom reply guidance"
                        : "Default helpful voice"}
                    </span>
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

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="app-loading" aria-busy="true">
          <span className="loading-mark">M</span>
          <p>Preparing your workspace...</p>
        </main>
      }
    >
      <DashboardPageContent />
    </Suspense>
  );
}
