const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export type ScanStatus =
  "pending" | "running" | "cancelling" | "cancelled" | "succeeded" | "failed";
export interface ScanRun {
  id: string;
  scope: "all" | "product";
  status: ScanStatus;
  product_ids: string[];
  platform: "hackernews";
  queries_total: number;
  queries_completed: number;
  items_fetched: number;
  reddit_items_fetched: number;
  hackernews_items_fetched: number;
  candidates_matched: number;
  candidates_rejected: number;
  candidates_qualified: number;
  candidates_direct?: number;
  candidates_helpful?: number;
  candidates_market_signals?: number;
  reddit_candidates_matched: number;
  reddit_candidates_rejected: number;
  reddit_candidates_qualified: number;
  hackernews_candidates_matched: number;
  hackernews_candidates_rejected: number;
  hackernews_candidates_qualified: number;
  opportunities_found: number;
  queries_explored?: number;
  queries_reused?: number;
  plan_summary?: string;
  current_message: string;
  error_message: string | null;
}
export interface ScanCandidateAudit {
  id: string;
  scan_id: string;
  product_id: string;
  platform: "reddit" | "hackernews";
  external_id: string;
  item_type: "story" | "comment";
  subreddit: string | null;
  title: string;
  body: string;
  author: string | null;
  url: string;
  source_created_at: string | null;
  matched_phrases: string[];
  source_query: string | null;
  intent_score: number;
  discovery_tier:
    | "direct_opportunity"
    | "helpful_conversation"
    | "market_signal"
    | "irrelevant";
  need_scope: "core" | "adjacent" | "unrelated";
  author_state: "asking" | "comparing" | "sharing" | "promoting";
  market_research_value: number;
  qualification_label: "rejected" | "worth_helping" | "potential_buyer";
  audience_fit: number | null;
  problem_fit: number | null;
  solution_seeking: number | null;
  buying_intent: number | null;
  reply_appropriateness: number | null;
  reasoning: string;
  decision: "rejected" | "qualified";
  human_review: CandidateHumanReview | null;
  created_at: string;
}
export type CandidateHumanTier = ScanCandidateAudit["discovery_tier"];
export interface CandidateHumanReview {
  id: string;
  candidate_evaluation_id: string;
  human_tier: CandidateHumanTier;
  note: string | null;
  created_at: string;
}
export interface CandidateEvaluationSummary {
  window_days: 7 | 30;
  product_id: string | null;
  reviewed: number;
  agreement: number;
  exact_accuracy_percent: number;
  actionable_precision_percent: number;
  actionable_recall_percent: number;
  actionable_predictions: number;
  human_actionable: number;
  false_positives: number;
  false_negatives: number;
}
async function call<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(body?.error?.message ?? "The scan request failed.");
  return body!.data as T;
}
export async function startScan(
  token: string,
  productId?: string,
  mode: "standard" | "deep" = "standard",
): Promise<{ scan_id: string }> {
  return call(token, "/api/scans", {
    method: "POST",
    body: JSON.stringify({
      ...(productId ? { product_id: productId } : {}),
      mode,
    }),
  });
}
export async function getScan(token: string, id: string): Promise<ScanRun> {
  return call(token, `/api/scans/${id}`);
}
export async function listScans(token: string): Promise<ScanRun[]> {
  return call(token, "/api/scans");
}
export async function cancelScan(token: string, id: string): Promise<ScanRun> {
  return call(token, `/api/scans/${id}/cancel`, { method: "POST", body: "{}" });
}
export async function listScanCandidates(
  token: string,
  id: string,
): Promise<ScanCandidateAudit[]> {
  return call(token, `/api/scans/${id}/candidates?limit=500`);
}
export async function reviewScanCandidate(
  token: string,
  candidateId: string,
  humanTier: CandidateHumanTier,
  note?: string | null,
): Promise<CandidateHumanReview> {
  return call(token, `/api/scans/candidates/${candidateId}/review`, {
    method: "POST",
    body: JSON.stringify({ human_tier: humanTier, note: note ?? null }),
  });
}
export async function getCandidateEvaluation(
  token: string,
  options: { productId?: string; window?: "7d" | "30d" } = {},
): Promise<CandidateEvaluationSummary> {
  const query = new URLSearchParams();
  if (options.productId) query.set("product_id", options.productId);
  query.set("window", options.window ?? "30d");
  return call(token, `/api/scans/evaluation?${query.toString()}`);
}
export async function exportCandidateEvaluation(
  token: string,
  productId?: string,
): Promise<{
  schema_version: string;
  privacy: string;
  cases: unknown[];
}> {
  const query = productId
    ? `?${new URLSearchParams({ product_id: productId }).toString()}`
    : "";
  return call(token, `/api/scans/evaluation/export${query}`);
}
