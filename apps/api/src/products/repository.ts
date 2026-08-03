import {
  createProductSchema,
  productSchema,
  type CreateProductInput,
  type Product,
  type UpdateProductInput,
} from "@mentionish/types";
import { createUserDatabase } from "@mentionish/database";

const productColumns =
  "id,user_id,name,description,keywords,voice_persona,is_active,deleted_at,created_at,updated_at";

export type ProductRepositoryFactory = (
  accessToken: string,
) => ProductRepository;

export interface ProductRepository {
  list(userId: string): Promise<Product[]>;
  get(userId: string, productId: string): Promise<Product | null>;
  create(userId: string, input: CreateProductInput): Promise<Product>;
  update(
    userId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<Product | null>;
  softDelete(userId: string, productId: string): Promise<boolean>;
}

export class ProductRepositoryError extends Error {
  constructor(
    readonly code:
      "PRODUCT_LIMIT_REACHED" | "KEYWORD_LIMIT_REACHED" | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}

function databaseError(error: { message: string }): ProductRepositoryError {
  if (error.message.includes("PRODUCT_LIMIT_REACHED")) {
    return new ProductRepositoryError(
      "PRODUCT_LIMIT_REACHED",
      "The active product limit for this plan has been reached.",
    );
  }
  if (error.message.includes("KEYWORD_LIMIT_REACHED")) {
    return new ProductRepositoryError(
      "KEYWORD_LIMIT_REACHED",
      "The keyword limit for this plan has been reached.",
    );
  }
  return new ProductRepositoryError(
    "DATABASE_ERROR",
    "The database request failed.",
  );
}

export function createSupabaseProductRepositoryFactory(
  url: string,
  anonKey: string,
): ProductRepositoryFactory {
  return (accessToken) => {
    const database = createUserDatabase(url, anonKey, accessToken);

    return {
      async list(userId) {
        const { data, error } = await database
          .from("products")
          .select(productColumns)
          .eq("user_id", userId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        if (error) throw databaseError(error);
        return productSchema.array().parse(data);
      },

      async get(userId, productId) {
        const { data, error } = await database
          .from("products")
          .select(productColumns)
          .eq("id", productId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw databaseError(error);
        return data ? productSchema.parse(data) : null;
      },

      async create(userId, input) {
        const values = createProductSchema.parse(input);
        const { data, error } = await database
          .from("products")
          .insert({
            ...values,
            user_id: userId,
            voice_persona: values.voice_persona ?? null,
          })
          .select(productColumns)
          .single();
        if (error) throw databaseError(error);
        return productSchema.parse(data);
      },

      async update(userId, productId, input) {
        const { data, error } = await database
          .from("products")
          .update(input)
          .eq("id", productId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .select(productColumns)
          .maybeSingle();
        if (error) throw databaseError(error);
        return data ? productSchema.parse(data) : null;
      },

      async softDelete(userId, productId) {
        const deletedAt = new Date().toISOString();
        const { data, error } = await database
          .from("products")
          .update({ is_active: false, deleted_at: deletedAt })
          .eq("id", productId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle();
        if (error) throw databaseError(error);
        return data !== null;
      },
    };
  };
}
