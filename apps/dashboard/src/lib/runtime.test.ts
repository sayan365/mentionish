import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalInstallationToken } from "./runtime.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("dashboard runtime", () => {
  it("bootstraps a local installation token", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: { mode: "local", token: "token-value" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(getLocalInstallationToken()).resolves.toBe("token-value");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/local/bootstrap",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
  });
});
