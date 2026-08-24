import { z } from "zod";

export const planCodeSchema = z.enum(["free", "lifetime", "monthly"]);
export const platformCodeSchema = z.enum(["reddit", "hackernews"]);
export const opportunityStatusSchema = z.enum([
  "unclassified",
  "new",
  "drafted",
  "posted",
  "skipped",
]);

export const opportunityFeedbackVerdictSchema = z.enum([
  "useful",
  "not_relevant",
]);

export const opportunityFeedbackReasonSchema = z.enum([
  "strong_problem",
  "clear_intent",
  "good_audience",
  "actionable",
  "wrong_audience",
  "wrong_problem",
  "weak_intent",
  "promotional",
  "outdated",
  "duplicate",
  "missing_context",
  "other",
]);

const usefulFeedbackReasons = new Set([
  "strong_problem",
  "clear_intent",
  "good_audience",
  "actionable",
]);

const opportunityFeedbackInputObjectSchema = z.object({
  verdict: opportunityFeedbackVerdictSchema,
  reason: opportunityFeedbackReasonSchema,
  note: z.string().trim().max(500).nullable().optional(),
});

export const opportunityFeedbackInputSchema =
  opportunityFeedbackInputObjectSchema.superRefine((value, context) => {
    const usefulReason = usefulFeedbackReasons.has(value.reason);
    if (
      (value.verdict === "useful" && !usefulReason) ||
      (value.verdict === "not_relevant" && usefulReason)
    )
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "The feedback reason does not match the verdict.",
      });
  });

export const opportunityFeedbackSchema =
  opportunityFeedbackInputObjectSchema.extend({
    id: z.string().uuid(),
    opportunity_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
  });

export const usageCounterSchema = z.object({
  used: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resets_at: z.string().datetime({ offset: true }).nullable(),
});

export const usageSummarySchema = z.object({
  plan: planCodeSchema,
  entitlement_status: z.enum(["active", "inactive", "refunded"]),
  unlimited: z.boolean().default(false),
  period: z.object({
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }).nullable(),
  }),
  classification: usageCounterSchema,
  draft: usageCounterSchema,
  products: z.object({
    active: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  }),
});

export const analyticsQuerySchema = z.object({
  product_id: z.string().uuid().optional(),
  window: z.enum(["7d", "30d"]).default("7d"),
});

export const analyticsSummarySchema = z.object({
  window_days: z.union([z.literal(7), z.literal(30)]),
  product_id: z.string().uuid().nullable(),
  found: z.number().int().nonnegative(),
  qualified: z.number().int().nonnegative(),
  drafted: z.number().int().nonnegative(),
  posted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  draft_to_post_percent: z.coerce.number().min(0),
  platforms: z.object({
    reddit: z.number().int().nonnegative().optional(),
    hackernews: z.number().int().nonnegative().optional(),
  }),
  feedback: z
    .object({
      reviewed: z.number().int().nonnegative(),
      useful: z.number().int().nonnegative(),
      not_relevant: z.number().int().nonnegative(),
      useful_percent: z.coerce.number().min(0).max(100),
      top_negative_reason: opportunityFeedbackReasonSchema.nullable(),
    })
    .default({
      reviewed: 0,
      useful: 0,
      not_relevant: 0,
      useful_percent: 0,
      top_negative_reason: null,
    }),
});

export const localConnectorIdSchema = z.enum([
  "agent-reach",
  "hackernews",
  "reddit",
  "twitter",
]);

export const localConnectorStateSchema = z.enum([
  "unavailable",
  "setup_needed",
  "ready",
  "degraded",
  "failed",
  "disabled",
]);

export const localConnectorDiagnosticSchema = z.object({
  id: localConnectorIdSchema,
  state: localConnectorStateSchema,
  backend: z.string().nullable(),
  message: z.string().min(1).max(500),
});
export function normalizeKeyword(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export const keywordSchema = z
  .string()
  .transform(normalizeKeyword)
  .pipe(z.string().min(2).max(80));

export const keywordsSchema = z
  .array(keywordSchema)
  .min(1)
  .max(25)
  .superRefine((keywords, context) => {
    const seen = new Set<string>();
    keywords.forEach((keyword, index) => {
      if (seen.has(keyword)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate keywords are not allowed.",
          path: [index],
        });
      }
      seen.add(keyword);
    });
  });

export const productPhraseKindSchema = z.enum([
  "problem",
  "question",
  "alternative",
  "category",
  "audience",
  "exclusion",
]);
export const productPhraseSourceSchema = z.enum(["manual", "ai_suggested"]);
export const productPhraseInputSchema = z.object({
  phrase: keywordSchema,
  kind: productPhraseKindSchema,
  source: productPhraseSourceSchema.optional(),
  rationale: z.string().trim().min(1).max(1000).nullable().optional(),
});
const productPhrasesSchema = z
  .array(productPhraseInputSchema)
  .max(25)
  .superRefine((phrases, context) => {
    const seen = new Set<string>();
    phrases.forEach(({ phrase }, index) => {
      if (seen.has(phrase)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate product phrases are not allowed.",
          path: [index, "phrase"],
        });
      }
      seen.add(phrase);
    });
  });

const optionalVoicePersonaSchema = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional();

const optionalAudienceSchema = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional();

const discoveryProfileListSchema = z
  .array(z.string().trim().min(2).max(160))
  .max(10);

export const discoveryProfileSchema = z.object({
  audiences: discoveryProfileListSchema.min(1),
  problems: discoveryProfileListSchema.min(1),
  situations: discoveryProfileListSchema,
  desired_outcomes: discoveryProfileListSchema,
  alternatives: discoveryProfileListSchema,
  buying_signals: discoveryProfileListSchema,
  helpful_signals: discoveryProfileListSchema,
  market_signals: discoveryProfileListSchema,
  exclusions: discoveryProfileListSchema,
  communities: discoveryProfileListSchema,
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  audience: optionalAudienceSchema,
  discovery_profile: discoveryProfileSchema.nullable().optional(),
  keywords: keywordsSchema,
  phrases: productPhrasesSchema.optional(),
  voice_persona: optionalVoicePersonaSchema,
});

export const updateProductSchema = createProductSchema
  .partial()
  .extend({ is_active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be supplied.",
  });

export const productSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  audience: z.string().nullable().optional(),
  discovery_profile: discoveryProfileSchema.nullable().optional(),
  keywords: z.array(z.string()),
  phrases: productPhrasesSchema.optional(),
  voice_persona: z.string().nullable(),
  is_active: z.boolean(),
  deleted_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const scannedPostSchema = z.object({
  id: z.string().uuid(),
  platform: platformCodeSchema,
  external_id: z.string(),
  subreddit: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  author: z.string().nullable(),
  url: z.string().url(),
  source_created_at: z.string().datetime({ offset: true }).nullable(),
  scanned_at: z.string().datetime({ offset: true }),
  source_checked_at: z.string().datetime({ offset: true }),
  source_updated_at: z.string().datetime({ offset: true }).nullable(),
  raw_metadata: z.record(z.string(), z.unknown()),
});

export const qualificationLabelSchema = z.enum([
  "worth_helping",
  "potential_buyer",
]);

export const opportunitySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  product_id: z.string().uuid(),
  scanned_post_id: z.string().uuid(),
  intent_score: z.number().int().min(0).max(100).nullable(),
  qualification_label: qualificationLabelSchema.nullable().optional(),
  audience_fit: z.number().int().min(0).max(100).nullable().optional(),
  problem_fit: z.number().int().min(0).max(100).nullable().optional(),
  solution_seeking: z.number().int().min(0).max(100).nullable().optional(),
  buying_intent: z.number().int().min(0).max(100).nullable().optional(),
  reply_appropriateness: z.number().int().min(0).max(100).nullable().optional(),
  reasoning: z.string().nullable(),
  status: opportunityStatusSchema,
  classified_at: z.string().datetime({ offset: true }).nullable(),
  posted_at: z.string().datetime({ offset: true }).nullable(),
  skipped_reason: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const opportunityFeedQuerySchema = z.object({
  status: z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.split(",").filter(Boolean)
        : Array.isArray(value)
          ? value.flatMap((item) =>
              typeof item === "string" ? item.split(",") : [],
            )
          : undefined,
    z.array(opportunityStatusSchema).min(1).max(5).default(["new", "drafted"]),
  ),
  platform: platformCodeSchema.optional(),
  min_score: z.coerce.number().int().min(0).max(100).default(60),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(500).optional(),
});

export const opportunityFeedItemSchema = opportunitySchema.extend({
  post: scannedPostSchema.omit({ raw_metadata: true }),
  draft: z
    .object({
      id: z.string().uuid(),
      opportunity_id: z.string().uuid(),
      generation_number: z.number().int().positive(),
      generated_text: z.string(),
      edited_text: z.string(),
      prompt_version: z.string(),
      is_current: z.boolean(),
      version: z.number().int().positive(),
      created_at: z.string().datetime({ offset: true }),
      updated_at: z.string().datetime({ offset: true }),
    })
    .nullable(),
  feedback: opportunityFeedbackSchema.nullable().default(null),
});

export const opportunityFeedPageSchema = z.object({
  items: z.array(opportunityFeedItemSchema),
  next_cursor: z.string().nullable(),
});

export const skipOpportunitySchema = z.object({
  reason: z.string().trim().min(1).max(500).default("Skipped by user."),
});

export const markOpportunityPostedSchema = z.object({
  posted_at: z.string().datetime({ offset: true }).optional(),
});

export const requestDraftSchema = z.object({
  regenerate: z.boolean().default(false),
});

export const communityPolicyStateSchema = z.enum([
  "allowed",
  "restricted",
  "unknown",
]);

export const replyPreflightStateSchema = z.enum([
  "not_required",
  "review_required",
  "caution",
  "blocked",
]);

export const replyPreflightReviewInputSchema = z.object({
  thread_reviewed: z.literal(true),
  rules_reviewed: z.literal(true),
  native_eligibility: z.enum(["allowed", "blocked"]),
  promotion_policy: communityPolicyStateSchema,
  ai_content_policy: communityPolicyStateSchema,
  unnecessary_links_removed: z.literal(true),
  disclosure_acknowledged: z.literal(true),
  manual_submit_acknowledged: z.literal(true),
});

export const replyPreflightSchema = z.object({
  opportunity_id: z.string().uuid(),
  platform: platformCodeSchema,
  community: z.string().nullable(),
  state: replyPreflightStateSchema,
  reason: z.string().min(1).max(500),
  source_url: z.string().url(),
  rules_url: z.string().url().nullable(),
  review: z
    .object({
      reviewed_at: z.string().datetime({ offset: true }),
      expires_at: z.string().datetime({ offset: true }),
      native_eligibility: z.enum(["allowed", "blocked"]),
      promotion_policy: communityPolicyStateSchema,
      ai_content_policy: communityPolicyStateSchema,
    })
    .nullable(),
  account_context: z
    .object({
      username: z.string().nullable(),
      total_karma: z.number().nullable(),
      account_created_at: z.string().nullable(),
      verified_email: z.boolean().nullable(),
    })
    .nullable(),
});

export const updateDraftTextSchema = z.object({
  edited_text: z.string().trim().min(1).max(3000),
  expected_version: z.number().int().positive(),
});

export const draftOperationSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  result_draft_id: z.string().uuid().nullable(),
  error_code: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
});

export const discoveredPostInputSchema = z.object({
  platform: platformCodeSchema,
  external_id: z.string().trim().min(1).max(255),
  subreddit: z.string().trim().min(1).max(100).nullable().optional(),
  title: z.string().default(""),
  body: z.string().default(""),
  author: z.string().trim().min(1).max(255).nullable().optional(),
  url: z.string().url(),
  source_created_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  source_updated_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  raw_metadata: z.record(z.string(), z.unknown()).default({}),
});

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchingProductKeywords(
  content: { title: string; body: string },
  keywords: readonly string[],
): string[] {
  const normalizedContent = (content.title + " " + content.body)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const matches: string[] = [];
  const seen = new Set<string>();

  for (const rawKeyword of keywords) {
    const parsedKeyword = keywordSchema.safeParse(rawKeyword);
    if (!parsedKeyword.success || seen.has(parsedKeyword.data)) continue;

    seen.add(parsedKeyword.data);
    const expression = new RegExp(
      "(?:^|[^\\p{L}\\p{N}])" +
        escapeRegularExpression(parsedKeyword.data) +
        "(?=$|[^\\p{L}\\p{N}])",
      "u",
    );
    if (expression.test(normalizedContent)) matches.push(parsedKeyword.data);
  }

  return matches;
}
export const queueNames = {
  platformFetch: "platform-fetch",
  classifyIntent: "classify-intent",
  generateDraft: "generate-draft",
  maintenance: "maintenance",
} as const;

export const platformFetchJobSchema = z.object({
  platform: platformCodeSchema,
  interval_minutes: z.number().int().min(1).max(60),
});

export const classifyIntentJobSchema = z.object({
  opportunity_id: z.string().uuid(),
  prompt_version: z.string().min(1).max(100),
});

export function classifyIntentJobId(
  opportunityId: string,
  promptVersion: string,
): string {
  const job = classifyIntentJobSchema.parse({
    opportunity_id: opportunityId,
    prompt_version: promptVersion,
  });
  let hash = 2_166_136_261;
  for (const character of job.prompt_version) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `classify-${job.opportunity_id}-${(hash >>> 0).toString(16)}`;
}

export const generateDraftJobSchema = z.object({
  operation_id: z.string().uuid(),
});

export function generateDraftJobId(operationId: string): string {
  return `draft-${z.string().uuid().parse(operationId)}`;
}

export const maintenanceJobSchema = z.object({
  task: z.enum([
    "dead-job-health",
    "reconciliation",
    "cleanup",
    "reddit-content-revalidation",
  ]),
});

export const scanRunStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
]);

export function scheduleBucket(
  scheduledAt: Date,
  intervalMinutes: number,
): string {
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes <= 0 ||
    !Number.isFinite(scheduledAt.getTime())
  ) {
    throw new Error(
      "A valid date and positive whole-minute interval are required.",
    );
  }

  const intervalMilliseconds = intervalMinutes * 60 * 1000;
  return new Date(
    Math.floor(scheduledAt.getTime() / intervalMilliseconds) *
      intervalMilliseconds,
  ).toISOString();
}

export function platformFetchJobId(
  platform: PlatformCode,
  bucket: string,
): string {
  const timestamp = Date.parse(bucket);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid schedule bucket.");
  return "scan-" + platform + "-" + timestamp;
}
export const userProfileSchema = z.object({
  id: z.string().uuid(),
  plan: planCodeSchema,
  entitlement_status: z.enum(["active", "inactive", "past_due", "refunded"]),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type Product = z.infer<typeof productSchema>;
export type DiscoveryProfile = z.infer<typeof discoveryProfileSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ScannedPost = z.infer<typeof scannedPostSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type OpportunityFeedQuery = z.infer<typeof opportunityFeedQuerySchema>;
export type OpportunityFeedItem = z.infer<typeof opportunityFeedItemSchema>;
export type OpportunityFeedPage = z.infer<typeof opportunityFeedPageSchema>;
export type OpportunityFeedback = z.infer<typeof opportunityFeedbackSchema>;
export type OpportunityFeedbackInput = z.infer<
  typeof opportunityFeedbackInputSchema
>;
export type OpportunityFeedbackVerdict = z.infer<
  typeof opportunityFeedbackVerdictSchema
>;
export type OpportunityFeedbackReason = z.infer<
  typeof opportunityFeedbackReasonSchema
>;
export type ReplyPreflight = z.infer<typeof replyPreflightSchema>;
export type ReplyPreflightReviewInput = z.infer<
  typeof replyPreflightReviewInputSchema
>;
export type DiscoveredPostInput = z.infer<typeof discoveredPostInputSchema>;
export type PlatformFetchJob = z.infer<typeof platformFetchJobSchema>;
export type ScanRunStatus = z.infer<typeof scanRunStatusSchema>;
export type PlanCode = z.infer<typeof planCodeSchema>;
export type PlatformCode = z.infer<typeof platformCodeSchema>;
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
export type LocalConnectorDiagnostic = z.infer<
  typeof localConnectorDiagnosticSchema
>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    details: Record<string, unknown>;
  };
}
