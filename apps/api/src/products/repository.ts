import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "@mentionish/types";

export type ProductRepositoryFactory = (
  accessToken: string,
) => ProductRepository;

export interface ProductRepository {
  list(userId: string): Promise<Product[]>;
  listArchived(userId: string): Promise<Product[]>;
  get(userId: string, productId: string): Promise<Product | null>;
  create(userId: string, input: CreateProductInput): Promise<Product>;
  update(
    userId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<Product | null>;
  softDelete(userId: string, productId: string): Promise<boolean>;
  restore(userId: string, productId: string): Promise<Product | null>;
}

export class ProductRepositoryError extends Error {
  constructor(
    readonly code: "KEYWORD_LIMIT_REACHED" | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}
