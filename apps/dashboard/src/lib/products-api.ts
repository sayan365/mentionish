import type {
  ApiErrorBody,
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "@mentionish/types";

export class ProductApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ProductApiError";
  }
}

function apiUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) throw new Error("NEXT_PUBLIC_API_URL is required");
  return value.replace(/\/$/, "");
}

async function productRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl() + path, {
    ...init,
    headers: {
      authorization: "Bearer " + accessToken,
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // The fallback below keeps proxy and offline failures understandable.
    }
    throw new ProductApiError(
      body?.error.message ?? "The product request failed. Please try again.",
      body?.error.code ?? "REQUEST_FAILED",
      response.status,
      body?.error.request_id,
    );
  }

  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}

export function listProducts(accessToken: string): Promise<Product[]> {
  return productRequest<Product[]>("/api/products", accessToken);
}

export function createProduct(
  accessToken: string,
  input: CreateProductInput,
): Promise<Product> {
  return productRequest<Product>("/api/products", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProduct(
  accessToken: string,
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  return productRequest<Product>("/api/products/" + productId, accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProduct(
  accessToken: string,
  productId: string,
): Promise<void> {
  return productRequest<void>("/api/products/" + productId, accessToken, {
    method: "DELETE",
  });
}

export function parseKeywordInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((keyword) =>
      keyword.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
    )
    .filter((keyword) => keyword.length > 0);
}
