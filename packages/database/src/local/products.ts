import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  productPhraseKinds,
  type CreateLocalProductInput,
  type LocalPhraseInput,
  type LocalProduct,
  type LocalProductPhrase,
  type ProductPhraseKind,
  type ProductPhraseSource,
  type UpdateLocalProductInput,
} from "./types.js";

interface ProductRow {
  id: string;
  name: string;
  description: string;
  audience: string | null;
  url: string | null;
  voice_persona: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface PhraseRow {
  id: string;
  product_id: string;
  phrase: string;
  normalized_phrase: string;
  kind: ProductPhraseKind;
  source: ProductPhraseSource;
  rationale: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export class LocalProductRepositoryError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "DUPLICATE_PHRASE" | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "LocalProductRepositoryError";
  }
}

export function normalizeLocalPhrase(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function requiredText(value: string, name: string, maximum: number): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new LocalProductRepositoryError(
      "INVALID_INPUT",
      `${name} must contain between 1 and ${maximum} characters.`,
    );
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  maximum: number,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return null;
  if (normalized.length > maximum) {
    throw new LocalProductRepositoryError(
      "INVALID_INPUT",
      `Optional text must not exceed ${maximum} characters.`,
    );
  }
  return normalized;
}

function validatePhrases(phrases: readonly LocalPhraseInput[]): ReadonlyArray<{
  phrase: string;
  normalizedPhrase: string;
  kind: ProductPhraseKind;
  source: ProductPhraseSource;
  rationale: string | null;
  isActive: boolean;
}> {
  if (phrases.length > 100) {
    throw new LocalProductRepositoryError(
      "INVALID_INPUT",
      "A product cannot have more than 100 phrases.",
    );
  }
  const seen = new Set<string>();
  return phrases.map((input) => {
    const phrase = input.phrase.normalize("NFKC").trim().replace(/\s+/g, " ");
    const normalizedPhrase = normalizeLocalPhrase(phrase);
    if (normalizedPhrase.length < 2 || normalizedPhrase.length > 200) {
      throw new LocalProductRepositoryError(
        "INVALID_INPUT",
        "Each phrase must contain between 2 and 200 characters.",
      );
    }
    if (!productPhraseKinds.includes(input.kind)) {
      throw new LocalProductRepositoryError(
        "INVALID_INPUT",
        "The phrase kind is invalid.",
      );
    }
    const isActive = input.isActive ?? true;
    const identity = `${input.kind}:${normalizedPhrase}`;
    if (isActive && seen.has(identity)) {
      throw new LocalProductRepositoryError(
        "DUPLICATE_PHRASE",
        `Duplicate active phrase: ${phrase}`,
      );
    }
    if (isActive) seen.add(identity);
    return {
      phrase,
      normalizedPhrase,
      kind: input.kind,
      source: input.source ?? "manual",
      rationale: optionalText(input.rationale, 1000),
      isActive,
    };
  });
}

function mapPhrase(row: PhraseRow): LocalProductPhrase {
  return {
    id: row.id,
    productId: row.product_id,
    phrase: row.phrase,
    normalizedPhrase: row.normalized_phrase,
    kind: row.kind,
    source: row.source,
    rationale: row.rationale,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LocalProductRepository {
  constructor(private readonly database: Database.Database) {}

  private phrasesFor(productId: string): LocalProductPhrase[] {
    return this.database
      .prepare<[string], PhraseRow>(
        `SELECT id, product_id, phrase, normalized_phrase, kind, source,
                rationale, is_active, created_at, updated_at
           FROM product_phrases
          WHERE product_id = ?
          ORDER BY is_active DESC, rowid`,
      )
      .all(productId)
      .map(mapPhrase);
  }

  private mapProduct(row: ProductRow): LocalProduct {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      audience: row.audience,
      url: row.url,
      voicePersona: row.voice_persona,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      phrases: this.phrasesFor(row.id),
    };
  }

  private productRow(productId: string): ProductRow | null {
    return (
      this.database
        .prepare<[string], ProductRow>(
          `SELECT id, name, description, audience, url, voice_persona,
                  is_active, created_at, updated_at, deleted_at
             FROM products
            WHERE id = ?`,
        )
        .get(productId) ?? null
    );
  }

  list(): LocalProduct[] {
    return this.database
      .prepare<[], ProductRow>(
        `SELECT id, name, description, audience, url, voice_persona,
                is_active, created_at, updated_at, deleted_at
           FROM products
          WHERE is_active = 1 AND deleted_at IS NULL
          ORDER BY updated_at DESC, id`,
      )
      .all()
      .map((row) => this.mapProduct(row));
  }

  listArchived(): LocalProduct[] {
    return this.database
      .prepare<[], ProductRow>(
        `SELECT id, name, description, audience, url, voice_persona,
                is_active, created_at, updated_at, deleted_at
           FROM products
          WHERE deleted_at IS NOT NULL
          ORDER BY updated_at DESC, id`,
      )
      .all()
      .map((row) => this.mapProduct(row));
  }

  get(productId: string): LocalProduct | null {
    const row = this.productRow(productId);
    return row ? this.mapProduct(row) : null;
  }

  create(input: CreateLocalProductInput): LocalProduct {
    const id = randomUUID();
    const now = new Date().toISOString();
    const phrases = validatePhrases(input.phrases ?? []);
    const create = this.database.transaction(() => {
      this.database
        .prepare<
          [
            string,
            string,
            string,
            string | null,
            string | null,
            string | null,
            number,
            string,
            string,
          ]
        >(
          `INSERT INTO products(
             id, name, description, audience, url, voice_persona,
             is_active, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          requiredText(input.name, "Product name", 80),
          requiredText(input.description, "Product description", 4000),
          optionalText(input.audience, 1000),
          optionalText(input.url, 2048),
          optionalText(input.voicePersona, 2000),
          input.isActive === false ? 0 : 1,
          now,
          now,
        );
      this.insertPhrases(id, phrases, now);
    });
    create.immediate();
    const created = this.get(id);
    if (!created) {
      throw new LocalProductRepositoryError(
        "DATABASE_ERROR",
        "The local product was not available after creation.",
      );
    }
    return created;
  }

  update(
    productId: string,
    input: UpdateLocalProductInput,
  ): LocalProduct | null {
    const existing = this.productRow(productId);
    if (!existing || existing.deleted_at !== null) return null;
    const now = new Date().toISOString();
    const phrases = input.phrases ? validatePhrases(input.phrases) : null;
    const update = this.database.transaction(() => {
      this.database
        .prepare<
          [
            string,
            string,
            string | null,
            string | null,
            string | null,
            number,
            string,
            string,
          ]
        >(
          `UPDATE products
              SET name = ?, description = ?, audience = ?, url = ?,
                  voice_persona = ?, is_active = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(
          input.name === undefined
            ? existing.name
            : requiredText(input.name, "Product name", 80),
          input.description === undefined
            ? existing.description
            : requiredText(input.description, "Product description", 4000),
          input.audience === undefined
            ? existing.audience
            : optionalText(input.audience, 1000),
          input.url === undefined
            ? existing.url
            : optionalText(input.url, 2048),
          input.voicePersona === undefined
            ? existing.voice_persona
            : optionalText(input.voicePersona, 2000),
          input.isActive === undefined
            ? existing.is_active
            : input.isActive
              ? 1
              : 0,
          now,
          productId,
        );
      if (phrases) {
        this.database
          .prepare<[string]>("DELETE FROM product_phrases WHERE product_id = ?")
          .run(productId);
        this.insertPhrases(productId, phrases, now);
      }
    });
    update.immediate();
    return this.get(productId);
  }

  replacePhrases(
    productId: string,
    phrases: readonly LocalPhraseInput[],
  ): LocalProduct | null {
    return this.update(productId, { phrases });
  }

  softDelete(productId: string): boolean {
    const now = new Date().toISOString();
    const result = this.database
      .prepare<[string, string, string]>(
        `UPDATE products
            SET is_active = 0, deleted_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, productId);
    return result.changes === 1;
  }

  restore(productId: string): LocalProduct | null {
    const now = new Date().toISOString();
    const result = this.database
      .prepare<[string, string]>(
        `UPDATE products
            SET is_active = 1, deleted_at = NULL, updated_at = ?
          WHERE id = ? AND deleted_at IS NOT NULL`,
      )
      .run(now, productId);
    return result.changes === 1 ? this.get(productId) : null;
  }

  private insertPhrases(
    productId: string,
    phrases: ReturnType<typeof validatePhrases>,
    now: string,
  ): void {
    const insert = this.database.prepare<
      [
        string,
        string,
        string,
        string,
        ProductPhraseKind,
        ProductPhraseSource,
        string | null,
        number,
        string,
        string,
      ]
    >(
      `INSERT INTO product_phrases(
         id, product_id, phrase, normalized_phrase, kind, source,
         rationale, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const phrase of phrases) {
      insert.run(
        randomUUID(),
        productId,
        phrase.phrase,
        phrase.normalizedPhrase,
        phrase.kind,
        phrase.source,
        phrase.rationale,
        phrase.isActive ? 1 : 0,
        now,
        now,
      );
    }
  }
}
