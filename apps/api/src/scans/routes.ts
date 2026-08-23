import { Router, type Response } from "express";
import { z } from "zod";
import type { LocalDiscoveryRepository } from "@mentionish/database";
import type { LocalScanEngine } from "./engine.js";

const startSchema = z.object({
  product_id: z.string().uuid().optional(),
  mode: z.enum(["standard", "deep"]).default("standard"),
});
const idSchema = z.string().uuid();
const discoveryTierSchema = z.enum([
  "direct_opportunity",
  "helpful_conversation",
  "market_signal",
  "irrelevant",
]);
const candidateReviewSchema = z.object({
  human_tier: discoveryTierSchema,
  note: z.string().trim().max(500).nullable().optional(),
});
const evaluationQuerySchema = z.object({
  product_id: z.string().uuid().optional(),
  window: z.enum(["7d", "30d"]).default("30d"),
});
function fail(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  response.status(status).json({
    error: {
      code,
      message,
      request_id: String(response.getHeader("x-request-id") ?? "unknown"),
      details: {},
    },
  });
}
export function createLocalScanRouter(
  engine: LocalScanEngine,
  repository: LocalDiscoveryRepository,
): Router {
  const router = Router();
  router.get("/reddit/config", (_request, response) => {
    response.setHeader("cache-control", "no-store");
    response.json({ data: engine.redditConfiguration() });
  });
  router.post("/reddit/test", async (request, response) => {
    const parsed = z
      .object({ profile: z.string().trim().max(50).nullable().default(null) })
      .safeParse(request.body ?? {});
    if (!parsed.success)
      return fail(
        response,
        400,
        "VALIDATION_ERROR",
        "The OpenCLI profile name is invalid.",
      );
    try {
      const account = await engine.verifyRedditProfile(
        parsed.data.profile || null,
      );
      response.json({ data: account });
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "REDDIT_TEST_FAILED";
      if (code === "REDDIT_DISABLED")
        return fail(
          response,
          409,
          code,
          "Reddit is disabled until accepted-risk mode is enabled.",
        );
      if (code === "INVALID_REDDIT_PROFILE")
        return fail(
          response,
          400,
          code,
          "Use only letters, numbers, hyphens, or underscores in the profile name.",
        );
      return fail(
        response,
        503,
        "REDDIT_TEST_FAILED",
        error instanceof Error ? error.message : "The Reddit read test failed.",
      );
    }
  });
  router.post("/", (request, response) => {
    try {
      const input = startSchema.parse(request.body ?? {});
      const started = engine.start(input.product_id, input.mode);
      response
        .status(202)
        .json({ data: { status: started.status, scan_id: started.scanId } });
    } catch (error) {
      if (error instanceof z.ZodError)
        return fail(
          response,
          400,
          "VALIDATION_ERROR",
          "The scan request is invalid.",
        );
      const code = error instanceof Error ? error.message : "SCAN_FAILED";
      if (code === "SCAN_ALREADY_RUNNING")
        return fail(
          response,
          409,
          code,
          "A scan is already running. Wait for it to finish or cancel it.",
        );
      if (code === "PRODUCT_NOT_FOUND")
        return fail(response, 404, code, "The product was not found.");
      if (code === "AI_CLASSIFICATION_NOT_CONFIGURED")
        return fail(
          response,
          422,
          code,
          "Configure and test a classification model in Settings before scanning.",
        );
      if (code === "NO_ACTIVE_PRODUCTS" || code === "NO_ACTIVE_PHRASES")
        return fail(
          response,
          422,
          code,
          code === "NO_ACTIVE_PRODUCTS"
            ? "Add an active product before scanning."
            : "Add at least one active listening phrase before scanning.",
        );
      return fail(
        response,
        500,
        "SCAN_FAILED",
        "The scan could not be started.",
      );
    }
  });
  router.get("/", (_request, response) =>
    response.json({ data: repository.listScans() }),
  );
  router.get("/evaluation", (request, response) => {
    const parsed = evaluationQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return fail(
        response,
        400,
        "VALIDATION_ERROR",
        "The evaluation query is invalid.",
      );
    const days = parsed.data.window === "7d" ? 7 : 30;
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1_000,
    ).toISOString();
    response.setHeader("cache-control", "no-store");
    return response.json({
      data: {
        window_days: days,
        product_id: parsed.data.product_id ?? null,
        ...repository.candidateEvaluationSummary(
          parsed.data.product_id ?? null,
          cutoff,
        ),
      },
    });
  });
  router.get("/evaluation/export", (request, response) => {
    const parsed = z
      .object({ product_id: z.string().uuid().optional() })
      .safeParse(request.query);
    if (!parsed.success)
      return fail(
        response,
        400,
        "VALIDATION_ERROR",
        "The evaluation export query is invalid.",
      );
    response.setHeader("cache-control", "no-store");
    return response.json({
      data: {
        schema_version: "candidate-evaluation-v1",
        privacy:
          "No titles, bodies, authors, URLs, queries, or notes included.",
        cases: repository.candidateEvaluationExport(
          parsed.data.product_id ?? null,
        ),
      },
    });
  });
  router.post("/candidates/:candidateId/review", (request, response) => {
    const parsedId = idSchema.safeParse(request.params.candidateId);
    const parsedBody = candidateReviewSchema.safeParse(request.body ?? {});
    if (!parsedId.success || !parsedBody.success)
      return fail(
        response,
        400,
        "VALIDATION_ERROR",
        "The candidate review is invalid.",
      );
    const review = repository.recordCandidateHumanReview(
      parsedId.data,
      parsedBody.data.human_tier,
      parsedBody.data.note ?? null,
    );
    return review
      ? response.status(201).json({ data: review })
      : fail(response, 404, "NOT_FOUND", "The scan candidate was not found.");
  });
  router.get("/:id/candidates", (request, response) => {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedQuery = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .safeParse(request.query);
    if (!parsedId.success || !parsedQuery.success)
      return fail(
        response,
        400,
        "VALIDATION_ERROR",
        "The candidate audit request is invalid.",
      );
    if (!repository.getScan(parsedId.data))
      return fail(response, 404, "NOT_FOUND", "The scan was not found.");
    response.setHeader("cache-control", "no-store");
    return response.json({
      data: repository.listCandidateAudits(
        parsedId.data,
        parsedQuery.data.limit,
      ),
    });
  });
  router.get("/:id", (request, response) => {
    const parsed = idSchema.safeParse(request.params.id);
    if (!parsed.success)
      return fail(response, 400, "VALIDATION_ERROR", "The scan id is invalid.");
    const scan = repository.getScan(parsed.data);
    return scan
      ? response.json({ data: scan })
      : fail(response, 404, "NOT_FOUND", "The scan was not found.");
  });
  router.post("/:id/cancel", (request, response) => {
    const parsed = idSchema.safeParse(request.params.id);
    if (!parsed.success)
      return fail(response, 400, "VALIDATION_ERROR", "The scan id is invalid.");
    return engine.cancel(parsed.data)
      ? response.status(202).json({ data: repository.getScan(parsed.data) })
      : fail(
          response,
          409,
          "SCAN_NOT_RUNNING",
          "This scan is no longer running.",
        );
  });
  return router;
}
