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
  reddit_candidates_matched: number;
  reddit_candidates_rejected: number;
  reddit_candidates_qualified: number;
  hackernews_candidates_matched: number;
  hackernews_candidates_rejected: number;
  hackernews_candidates_qualified: number;
  opportunities_found: number;
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
  intent_score: number;
  qualification_label: "rejected" | "worth_helping" | "potential_buyer";
  audience_fit: number | null;
  problem_fit: number | null;
  solution_seeking: number | null;
  buying_intent: number | null;
  reply_appropriateness: number | null;
  reasoning: string;
  decision: "rejected" | "qualified";
  created_at: string;
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
): Promise<{ scan_id: string }> {
  return call(token, "/api/scans", {
    method: "POST",
    body: JSON.stringify(productId ? { product_id: productId } : {}),
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
