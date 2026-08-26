import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnalytics } from "./workspace-api";

afterEach(() => vi.unstubAllGlobals());

describe("workspace API client", () => {
  it("requests a bounded analytics window and product", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              window_days: 30,
              product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              found: 10,
              qualified: 4,
              drafted: 2,
              posted: 1,
              skipped: 1,
              draft_to_post_percent: 50,
              platforms: { reddit: 4, hackernews: 0 },
            },
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAnalytics("token", {
      productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      window: "30d",
    });

    expect(result.window_days).toBe(30);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves structured API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "DATABASE_UNAVAILABLE", message: "Try again." },
            }),
            { status: 503 },
          ),
        ),
      ),
    );

    await expect(getAnalytics("token", { window: "7d" })).rejects.toMatchObject(
      {
        status: 503,
        code: "DATABASE_UNAVAILABLE",
      },
    );
  });
});
