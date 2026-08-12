const defaultApiUrl = "http://localhost:4000";
let localTokenPromise: Promise<string> | null = null;

export function isLocalRuntime(): boolean {
  return process.env.NEXT_PUBLIC_MENTIONISH_RUNTIME_MODE !== "hosted";
}

export function dashboardApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl).replace(/\/$/, "");
}

export function getLocalInstallationToken(): Promise<string> {
  if (!isLocalRuntime()) {
    return Promise.reject(
      new Error("The installation token is available only in local mode."),
    );
  }
  localTokenPromise ??= fetch(dashboardApiUrl() + "/api/local/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    cache: "no-store",
  })
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as {
        data?: { mode?: string; token?: string };
        error?: { message?: string };
      } | null;
      if (
        !response.ok ||
        body?.data?.mode !== "local" ||
        typeof body.data.token !== "string"
      ) {
        throw new Error(
          body?.error?.message ??
            "The local Mentionish API could not initialize this dashboard.",
        );
      }
      return body.data.token;
    })
    .catch((error: unknown) => {
      localTokenPromise = null;
      throw error;
    });
  return localTokenPromise;
}
