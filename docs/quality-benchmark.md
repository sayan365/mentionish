# Conversation quality benchmark

## Purpose

The benchmark prevents classification-policy changes from silently flooding the reply queue with weak or promotional results. It is an offline, provider-neutral release gate and does not call Reddit, Hacker News, or an AI provider.

Run it from the repository root:

    npm run quality:benchmark

The command exits non-zero when a release threshold fails and prints tier mismatches for diagnosis.

## Versioned acceptance set

`apps/api/src/scans/quality-benchmark-cases.ts` contains 24 representative cases split evenly across direct opportunities, helpful conversations, market signals, and irrelevant results.

The set covers Mentionish-style customer discovery and recruiting automation products on Reddit and Hacker News. Each case stores a short synthetic/curated conversation, the expected tier, and a frozen multidimensional classifier result. The fixture contains no credentials, private data, or copied user database content.

## Release thresholds

- at least four cases for every tier;
- at least 85% exact tier accuracy;
- at least 90% actionable-result precision;
- at least 85% actionable-result recall;
- at least 85% direct-opportunity precision;
- zero market-signal or irrelevant cases admitted to the reply queue.

The gate is precision-first. Thresholds must not be weakened merely to make a failing change pass. Add a representative regression case first, explain the desired human label, then change the policy if the evidence supports it.

## What this benchmark proves

It proves that Mentionish's deterministic policy maps frozen classifier dimensions to the intended tier and fails closed on non-actionable cases. It also protects the boundary between market research and conversations where a reply is appropriate.

It does not prove that every AI model scores raw text correctly, that retrieval found all relevant conversations, or that a platform connector returned complete data. Those require reviewed real scan results and provider-specific evaluation. Useful/Not relevant feedback and the scan decision audit provide that production evidence.

## Comment context

Comments are evaluated with their own text plus bounded parent-thread context. Reddit supplies the parent title and a limited parent-body excerpt; Hacker News supplies the story title available in search results. The original stored comment body is not rewritten. This reduces false decisions caused by context-free replies while keeping provider input bounded.

## Adding cases

1. Start from a sanitized, representative failure pattern.
2. Remove usernames, URLs, secrets, and unnecessary verbatim source text.
3. Assign the expected tier through human product judgment.
4. Preserve the classifier dimensions that reproduced the decision.
5. Run the benchmark and focused tests.
6. Document any intentional policy change.
