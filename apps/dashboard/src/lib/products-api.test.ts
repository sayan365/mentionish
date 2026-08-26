import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProductApiError,
  createProduct,
  deleteProduct,
  listArchivedProducts,
  listProducts,
  parseKeywordInput,
  restoreProduct,
  updateProduct,
} from "./products-api";

const product = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Mentionish",
  description: "Find relevant conversations.",
  keywords: ["customer research"],
  voice_persona: null,
  is_active: true,
  deleted_at: null,
  created_at: "2026-08-04T00:00:00.000Z",
  updated_at: "2026-08-04T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("product API client", () => {
  it("normalizes comma and newline separated keywords", () => {
    expect(parseKeywordInput(" Customer   Research,\nFounders\n")).toEqual([
      "customer research",
      "founders",
    ]);
  });

  it("lists products with the Supabase access token", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [product] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listProducts("access-token")).resolves.toEqual([product]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.example.com/api/products");
    expect(new Headers(call?.[1]?.headers).get("authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("lists archived products separately", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    const archived = {
      ...product,
      is_active: false,
      deleted_at: "2026-08-05T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [archived] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listArchivedProducts("token")).resolves.toEqual([archived]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/api/products/archived",
    );
  });

  it("sends create, update, and delete mutations", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: product }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ...product, name: "New" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: product }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createProduct("token", {
      name: product.name,
      description: product.description,
      keywords: product.keywords,
    });
    await updateProduct("token", product.id, { name: "New" });
    await deleteProduct("token", product.id);
    await restoreProduct("token", product.id);

    expect(
      fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method),
    ).toEqual(["POST", "PATCH", "DELETE", "POST"]);
  });

  it("preserves structured API errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "DATABASE_UNAVAILABLE",
              message: "The product service is unavailable.",
              request_id: "request-1",
              details: {},
            },
          }),
          { status: 503 },
        ),
      ),
    );

    const error = await listProducts("token").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProductApiError);
    expect(error).toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      status: 503,
      requestId: "request-1",
    });
  });
});
