const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export interface RedditConfiguration {
  enabled: boolean;
  profile: string | null;
  kill_switch: boolean;
  verified_account: {
    username?: string;
    totalKarma?: number | null;
    accountCreated?: string | null;
    verifiedEmail?: boolean | null;
    verifiedAt?: string;
  } | null;
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
    throw new Error(
      body?.error?.message ?? "The Reddit settings request failed.",
    );
  return body!.data as T;
}
export function getRedditConfiguration(token: string) {
  return call<RedditConfiguration>(token, "/api/scans/reddit/config");
}
export function testRedditProfile(token: string, profile: string | null) {
  return call<Record<string, unknown>>(token, "/api/scans/reddit/test", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
}
