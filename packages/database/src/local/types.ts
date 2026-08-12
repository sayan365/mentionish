export const productPhraseKinds = [
  "problem",
  "question",
  "alternative",
  "category",
  "audience",
  "exclusion",
] as const;

export type ProductPhraseKind = (typeof productPhraseKinds)[number];
export type ProductPhraseSource = "manual" | "ai_suggested";

export interface LocalProductPhrase {
  id: string;
  productId: string;
  phrase: string;
  normalizedPhrase: string;
  kind: ProductPhraseKind;
  source: ProductPhraseSource;
  rationale: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalProduct {
  id: string;
  name: string;
  description: string;
  audience: string | null;
  url: string | null;
  voicePersona: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  phrases: LocalProductPhrase[];
}

export interface LocalPhraseInput {
  phrase: string;
  kind: ProductPhraseKind;
  source?: ProductPhraseSource;
  rationale?: string | null;
  isActive?: boolean;
}

export interface CreateLocalProductInput {
  name: string;
  description: string;
  audience?: string | null;
  url?: string | null;
  voicePersona?: string | null;
  isActive?: boolean;
  phrases?: readonly LocalPhraseInput[];
}

export interface UpdateLocalProductInput {
  name?: string;
  description?: string;
  audience?: string | null;
  url?: string | null;
  voicePersona?: string | null;
  isActive?: boolean;
  phrases?: readonly LocalPhraseInput[];
}
