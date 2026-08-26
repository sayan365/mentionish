import { dashboardApiUrl } from "./runtime";

export interface LocalDataStatus {
  database_path: string;
  backups_directory: string;
  schema_version: number;
}

export interface LocalResetResult {
  backup_filename: string;
  backup_schema_version: number;
  cleared: {
    products: number;
    conversations: number;
    sourceItems: number;
    scans: number;
    drafts: number;
  };
}

export class LocalDataApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function checkedResponse(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(dashboardApiUrl() + path, {
    ...init,
    headers: {
      authorization: "Bearer " + accessToken,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new LocalDataApiError(
      response.status,
      body?.error?.code ?? "LOCAL_DATA_REQUEST_FAILED",
      body?.error?.message ?? "The local data action could not be completed.",
    );
  }
  return response;
}

export async function getLocalDataStatus(
  accessToken: string,
): Promise<LocalDataStatus> {
  const response = await checkedResponse(accessToken, "/api/local/data/", {
    cache: "no-store",
  });
  return ((await response.json()) as { data: LocalDataStatus }).data;
}

export async function downloadLocalBackup(
  accessToken: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await checkedResponse(
    accessToken,
    "/api/local/data/backups",
    { method: "POST" },
  );
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
    `mentionish-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`;
  return { blob: await response.blob(), filename };
}

export async function openLocalDataFolder(accessToken: string): Promise<void> {
  await checkedResponse(accessToken, "/api/local/data/open-folder", {
    method: "POST",
  });
}

export async function resetLocalWorkspace(
  accessToken: string,
  confirmation: string,
): Promise<LocalResetResult> {
  const response = await checkedResponse(accessToken, "/api/local/data/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
  return ((await response.json()) as { data: LocalResetResult }).data;
}
