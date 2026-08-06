import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnalytics, getUsage, WorkspaceApiError } from "./workspace-api";

afterEach(() => vi.unstubAllGlobals());

describe("workspace API client", () => {
  it("parses authoritative usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                plan: "free",
                entitlement_status: "active",
                period: {
                  starts_at: "2026-08-06T00:00:00.000Z",
                  ends_at: null,
                },
                classification: {
                  used: 50,
                  reserved: 0,
                  limit: 50,
                  remaining: 0,
                  resets_at: null,
                },
                draft: {
                  used: 1,
                  reserved: 0,
                  limit: 5,
                  remaining: 4,
                  resets_at: null,
                },
                products: { active: 1, limit: 1 },
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    await expect(getUsage("token")).resolves.toMatchObject({
      classification: { remaining: 0 },
      draft: { remaining: 4 },
    });
  });

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
              platforms: { reddit: 4 },
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
              error: {
                code: "NO_ACTIVE_ENTITLEMENT",
                message: "No active plan is available.",
              },
            }),
            { status: 403 },
          ),
        ),
      ),
    );
    let error: unknown;
    try {
      await getUsage("token");
    } catch (caught: unknown) {
      error = caught;
    }
    expect(error).toBeInstanceOf(WorkspaceApiError);
    expect(error).toMatchObject({ status: 403, code: "NO_ACTIVE_ENTITLEMENT" });
  });
});
