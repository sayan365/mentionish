import type {
  LocalProductRepository,
  LocalPhraseInput,
  LocalProduct,
} from "@mentionish/database";
import { productSchema, type Product } from "@mentionish/types";
import { localOwnerId } from "../middleware/auth.js";
import type {
  ProductRepository,
  ProductRepositoryFactory,
} from "./repository.js";

function toApiProduct(product: LocalProduct): Product {
  return productSchema.parse({
    id: product.id,
    user_id: localOwnerId,
    name: product.name,
    description: product.description,
    audience: product.audience,
    discovery_profile: product.discoveryProfile,
    keywords: product.phrases
      .filter((phrase) => phrase.isActive && phrase.kind !== "exclusion")
      .map((phrase) => phrase.normalizedPhrase),
    phrases: product.phrases
      .filter((phrase) => phrase.isActive && phrase.kind !== "exclusion")
      .map((phrase) => ({
        phrase: phrase.normalizedPhrase,
        kind: phrase.kind,
        source: phrase.source,
        rationale: phrase.rationale,
      })),
    voice_persona: product.voicePersona,
    is_active: product.isActive,
    deleted_at: product.deletedAt,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  });
}

function keywordPhrases(
  keywords: readonly string[],
  phrases?: ReadonlyArray<{
    phrase: string;
    kind: LocalPhraseInput["kind"];
    source?: LocalPhraseInput["source"] | undefined;
    rationale?: string | null | undefined;
  }>,
): LocalPhraseInput[] {
  if (phrases?.length)
    return phrases.map((item) => ({
      phrase: item.phrase,
      kind: item.kind,
      ...(item.source === undefined ? {} : { source: item.source }),
      ...(item.rationale === undefined ? {} : { rationale: item.rationale }),
    }));
  return keywords.map((phrase) => ({ phrase, kind: "category" }));
}

export function createLocalProductRepositoryFactory(
  localRepository: LocalProductRepository,
): ProductRepositoryFactory {
  return () => {
    const repository: ProductRepository = {
      list(userId) {
        return Promise.resolve(
          userId === localOwnerId
            ? localRepository.list().map(toApiProduct)
            : [],
        );
      },
      listArchived(userId) {
        return Promise.resolve(
          userId === localOwnerId
            ? localRepository.listArchived().map(toApiProduct)
            : [],
        );
      },
      get(userId, productId) {
        if (userId !== localOwnerId) return Promise.resolve(null);
        const product = localRepository.get(productId);
        return Promise.resolve(product ? toApiProduct(product) : null);
      },
      create(userId, input) {
        if (userId !== localOwnerId)
          return Promise.reject(new Error("Invalid local owner."));
        return Promise.resolve(
          toApiProduct(
            localRepository.create({
              name: input.name,
              description: input.description,
              audience: input.audience ?? null,
              discoveryProfile: input.discovery_profile ?? null,
              voicePersona: input.voice_persona ?? null,
              phrases: keywordPhrases(input.keywords, input.phrases),
            }),
          ),
        );
      },
      update(userId, productId, input) {
        if (userId !== localOwnerId) return Promise.resolve(null);
        const update = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.audience === undefined ? {} : { audience: input.audience }),
          ...(input.discovery_profile === undefined
            ? {}
            : { discoveryProfile: input.discovery_profile }),
          ...(input.voice_persona === undefined
            ? {}
            : { voicePersona: input.voice_persona }),
          ...(input.is_active === undefined
            ? {}
            : { isActive: input.is_active }),
          ...(input.keywords === undefined
            ? {}
            : { phrases: keywordPhrases(input.keywords, input.phrases) }),
        };
        const product = localRepository.update(productId, update);
        return Promise.resolve(product ? toApiProduct(product) : null);
      },
      softDelete(userId, productId) {
        return Promise.resolve(
          userId === localOwnerId && localRepository.softDelete(productId),
        );
      },
      restore(userId, productId) {
        if (userId !== localOwnerId) return Promise.resolve(null);
        const product = localRepository.restore(productId);
        return Promise.resolve(product ? toApiProduct(product) : null);
      },
    };
    return repository;
  };
}
