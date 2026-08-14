const stopWords = new Set([
  "a",
  "adding",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "best",
  "but",
  "by",
  "can",
  "do",
  "find",
  "for",
  "from",
  "full",
  "how",
  "i",
  "in",
  "is",
  "it",
  "looking",
  "manually",
  "much",
  "need",
  "of",
  "on",
  "or",
  "our",
  "re",
  "spending",
  "the",
  "their",
  "this",
  "time",
  "to",
  "too",
  "way",
  "we",
  "what",
  "when",
  "with",
  "without",
  "you",
  "your",
]);

function tokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function stem(value: string): string {
  if (value.length > 5 && value.endsWith("ies"))
    return value.slice(0, -3) + "y";
  if (value.length > 5 && value.endsWith("ing")) return value.slice(0, -3);
  if (value.length > 5 && value.endsWith("ed")) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith("ers")) return value.slice(0, -1);
  if (value.length > 4 && value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function meaningfulTokens(value: string): string[] {
  return tokens(value).filter((token) => !stopWords.has(token));
}

function concepts(value: string): string[] {
  return [...new Set(meaningfulTokens(value).map(stem))];
}

function sequence(value: string): string[] {
  return meaningfulTokens(value).map(stem);
}

function hasNearbyPhrasePair(
  phraseTerms: readonly string[],
  contentTerms: readonly string[],
): boolean {
  for (let index = 0; index < phraseTerms.length - 1; index += 1) {
    const first = phraseTerms[index];
    const second = phraseTerms[index + 1];
    const firstPositions = contentTerms.flatMap((term, position) =>
      term === first ? [position] : [],
    );
    const secondPositions = contentTerms.flatMap((term, position) =>
      term === second ? [position] : [],
    );
    if (
      firstPositions.some((left) =>
        secondPositions.some((right) => Math.abs(left - right) <= 5),
      )
    )
      return true;
  }
  return false;
}

function hasHelpIntent(value: string): boolean {
  return /\?|\b(how|help|need|broken|advice|recommend\w*|problem|struggl\w*|difficult\w*|alternative\w*|automat\w*|better|faster|reduce|buried|overwhelm\w*|anyone|can(?:not|'t)|keep\w*|trying|stuck|frustrat\w*|pain\w*|wast\w*|takes? forever|switch\w*|replac\w*|budget|pay(?:ing)?|worth it)\b/i.test(
    value,
  );
}

function uniqueQuery(value: string): string {
  return meaningfulTokens(value).slice(0, 4).join(" ");
}

export interface AdaptiveQueryMemory {
  query: string;
  normalizedQuery: string;
  timesUsed: number;
  itemsFetched: number;
  candidatesReviewed: number;
  candidatesQualified: number;
  lastUsedAt: string;
}
export interface PlannedSearchQuery {
  query: string;
  strategy: "explore" | "proven" | "rotate" | "fallback";
}

function normalizedQuery(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function selectAdaptiveQueries(
  baseQueries: readonly string[],
  hypotheses: readonly string[],
  memory: readonly AdaptiveQueryMemory[],
  maximum: number,
  now = Date.now(),
): PlannedSearchQuery[] {
  const limit = Math.max(1, maximum);
  const memoryByQuery = new Map(
    memory.map((entry) => [entry.normalizedQuery, entry]),
  );
  const result: PlannedSearchQuery[] = [];
  const selected = new Set<string>();
  const add = (query: string, strategy: PlannedSearchQuery["strategy"]) => {
    const normalized = normalizedQuery(query);
    if (
      normalized.length < 2 ||
      concepts(normalized).length < 2 ||
      selected.has(normalized)
    )
      return false;
    selected.add(normalized);
    result.push({ query: query.trim(), strategy });
    return true;
  };
  const successfulCooldown = 3 * 60 * 60 * 1000;
  const unsuccessfulCooldown = 48 * 60 * 60 * 1000;
  const cooled = (entry: AdaptiveQueryMemory, cooldown: number) =>
    now - Date.parse(entry.lastUsedAt) >= cooldown;
  const provenTarget = Math.max(1, Math.floor(limit * 0.25));
  const proven = memory
    .filter(
      (entry) =>
        entry.candidatesQualified > 0 && cooled(entry, successfulCooldown),
    )
    .sort((left, right) => {
      const leftRate =
        left.candidatesQualified / Math.max(1, left.candidatesReviewed);
      const rightRate =
        right.candidatesQualified / Math.max(1, right.candidatesReviewed);
      return rightRate - leftRate || right.itemsFetched - left.itemsFetched;
    });
  for (const entry of proven) {
    if (result.length >= provenTarget) break;
    add(entry.query, "proven");
  }

  const unseen = [...hypotheses, ...baseQueries].filter(
    (query) => !memoryByQuery.has(normalizedQuery(query)),
  );
  const exploreTarget = Math.max(result.length, Math.ceil(limit * 0.9));
  for (const query of unseen) {
    if (result.length >= exploreTarget) break;
    add(query, "explore");
  }

  const rotated = memory
    .filter(
      (entry) =>
        cooled(entry, unsuccessfulCooldown) &&
        entry.candidatesQualified === 0 &&
        entry.candidatesReviewed === 0,
    )
    .sort(
      (left, right) =>
        Date.parse(left.lastUsedAt) - Date.parse(right.lastUsedAt) ||
        left.timesUsed - right.timesUsed,
    );
  for (const entry of rotated) {
    if (result.length >= limit) break;
    add(entry.query, "rotate");
  }
  for (const query of [...hypotheses, ...baseQueries]) {
    if (result.length >= limit) break;
    const previous = memoryByQuery.get(normalizedQuery(query));
    if (previous && previous.candidatesQualified === 0) continue;
    add(query, previous ? "proven" : "explore");
  }
  for (const entry of proven) {
    if (result.length >= limit) break;
    add(entry.query, "proven");
  }
  return result.slice(0, limit);
}

export function discoveryCandidateEvidence(
  content: { title: string; body: string },
  phrases: readonly string[],
  context: string,
  searchQuery: string,
): { score: number; matchedPhrases: string[] } {
  const full = `${content.title} ${content.body}`;
  if (!hasHelpIntent(full)) return { score: 0, matchedPhrases: [] };
  if (
    /\b(who is hiring|job posting|jobs thread)\b|\bhiring\s*:/i.test(
      content.title,
    )
  )
    return { score: 0, matchedPhrases: [] };
  const contentTerms = new Set(concepts(full));
  const queryTerms = concepts(searchQuery);
  const contextTerms = concepts(context);
  const queryOverlap = queryTerms.filter((term) => contentTerms.has(term));
  const contextOverlap = contextTerms.filter((term) => contentTerms.has(term));
  const generic = new Set([
    "product",
    "software",
    "tool",
    "people",
    "customer",
    "user",
    "founder",
    "startup",
    "reddit",
    "hacker",
    "news",
  ]);
  const distinctiveQueryOverlap = queryOverlap.filter(
    (term) => !generic.has(term),
  );
  const distinctiveContextOverlap = contextOverlap.filter(
    (term) => !generic.has(term),
  );
  const phraseScores = phrases
    .map((phrase) => ({
      phrase,
      overlap: concepts(phrase).filter((term) => contentTerms.has(term)).length,
    }))
    .filter(({ overlap }) => overlap > 0)
    .sort((left, right) => right.overlap - left.overlap);
  const score = Math.min(
    100,
    24 +
      distinctiveQueryOverlap.length * 20 +
      Math.min(24, distinctiveContextOverlap.length * 8) +
      Math.min(18, (phraseScores[0]?.overlap ?? 0) * 9),
  );
  const supported =
    (distinctiveQueryOverlap.length >= 1 &&
      (distinctiveContextOverlap.length >= 1 ||
        (phraseScores[0]?.overlap ?? 0) >= 2)) ||
    distinctiveContextOverlap.length >= 2;
  return {
    score: supported ? score : 0,
    matchedPhrases: phraseScores.slice(0, 3).map(({ phrase }) => phrase),
  };
}

function spreadSelection(values: readonly string[], maximum: number): string[] {
  if (values.length <= maximum) return [...values];
  if (maximum === 1) return [values[0]!];
  const selected: string[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const position = Math.round((index * (values.length - 1)) / (maximum - 1));
    const value = values[position];
    if (value && !selected.includes(value)) selected.push(value);
  }
  return selected;
}

export function planSearchQueries(
  phrases: readonly string[],
  maximum: number,
): string[] {
  const limit = Math.max(1, maximum);
  const frequency = new Map<string, number>();
  for (const phrase of phrases)
    for (const term of concepts(phrase))
      frequency.set(term, (frequency.get(term) ?? 0) + 1);

  const primary: string[] = [];
  const secondary: string[] = [];
  for (const phrase of phrases) {
    const original = meaningfulTokens(phrase);
    if (original.length < 2) continue;
    const pairs = original.slice(0, -1).map((term, index) => {
      const next = original[index + 1]!;
      return {
        query: `${term} ${next}`,
        score:
          (frequency.get(stem(term)) ?? 0) + (frequency.get(stem(next)) ?? 0),
      };
    });
    // Prefer the least-repeated adjacent concepts. Repeated words such as
    // "customer" or "software" are useful context, but make poor discovery
    // queries when a more distinctive pain/workflow pair is available.
    pairs.sort((left, right) => left.score - right.score);
    const bestPair = pairs[0]?.query;
    if (bestPair && !primary.includes(bestPair)) primary.push(bestPair);

    const ranked = original
      .map((term, index) => ({
        term,
        index,
        frequency: frequency.get(stem(term)) ?? 0,
      }))
      .sort(
        (left, right) =>
          left.frequency - right.frequency || left.index - right.index,
      )
      .slice(0, 3)
      .sort((left, right) => left.index - right.index)
      .map(({ term }) => term)
      .join(" ");
    const compact = uniqueQuery(ranked);
    if (
      compact.length >= 2 &&
      !primary.includes(compact) &&
      !secondary.includes(compact)
    )
      secondary.push(compact);
  }

  const selected = spreadSelection(primary, limit);
  for (const query of secondary)
    if (selected.length < limit && !selected.includes(query))
      selected.push(query);
  return selected;
}

export function matchingListeningPhrases(
  content: { title: string; body: string },
  phrases: readonly string[],
  options: { requireHelpIntent?: boolean } = {},
): string[] {
  const full = `${content.title} ${content.body}`;
  if (
    /\b(who is hiring|job posting|jobs thread)\b|\bhiring\s*:/i.test(
      content.title,
    )
  )
    return [];
  if (options.requireHelpIntent !== false && !hasHelpIntent(full)) return [];

  const contentSequence = sequence(full);
  const contentTerms = new Set(contentSequence);
  return phrases.filter((phrase) => {
    const phraseSequence = sequence(phrase);
    const unique = [...new Set(phraseSequence)];
    if (unique.length < 2) return false;
    const overlap = unique.filter((term) => contentTerms.has(term)).length;
    const required =
      unique.length <= 2
        ? unique.length
        : Math.min(4, Math.max(3, Math.ceil(unique.length * 0.6)));
    return (
      overlap >= required &&
      hasNearbyPhrasePair(phraseSequence, contentSequence)
    );
  });
}
