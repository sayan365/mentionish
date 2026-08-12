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
  return /\?|\b(how|help|need|broken|advice|recommend\w*|problem|struggl\w*|difficult\w*|alternative\w*|automat\w*|better|faster|reduce|buried|overwhelm\w*|anyone|can(?:not|'t)|keep\w*|trying|stuck|frustrat\w*|pain\w*|wast\w*|takes? forever|switch\w*|replac\w*|tool\w*|software|service|solution|budget|pay(?:ing)?|worth it)\b/i.test(
    value,
  );
}

function uniqueQuery(value: string): string {
  return meaningfulTokens(value).slice(0, 4).join(" ");
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
        : Math.min(3, Math.max(2, Math.ceil(unique.length * 0.4)));
    return (
      overlap >= required &&
      hasNearbyPhrasePair(phraseSequence, contentSequence)
    );
  });
}
