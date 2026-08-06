import crypto from "node:crypto";
import {
  markOpportunityPostedSchema,
  requestDraftSchema,
  updateDraftTextSchema,
  opportunityFeedQuerySchema,
  skipOpportunitySchema,
} from "@mentionish/types";
import { Router, type Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import {
  OpportunityRepositoryError,
  type OpportunityRepositoryFactory,
} from "./repository.js";
import type { DraftQueue } from "./draft-queue.js";

const idSchema = z.string().uuid();
function sendError(
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
function handleError(response: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    sendError(response, 400, "VALIDATION_ERROR", "The request is invalid.");
  } else if (
    error instanceof OpportunityRepositoryError &&
    error.message === "INVALID_CURSOR"
  ) {
    sendError(
      response,
      400,
      "INVALID_CURSOR",
      "The pagination cursor is invalid.",
    );
  } else {
    sendError(
      response,
      503,
      "DATABASE_UNAVAILABLE",
      "The opportunity service is temporarily unavailable.",
    );
  }
}

export function createProductOpportunityRouter(
  createRepository: OpportunityRepositoryFactory,
): Router {
  const router = Router({ mergeParams: true });
  router.get("/", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    try {
      const productId = idSchema.parse(
        (request.params as Record<string, string>).id,
      );
      const query = opportunityFeedQuerySchema.parse(request.query);
      const page = await createRepository(authenticated.auth.accessToken).list(
        authenticated.auth.userId,
        productId,
        query,
      );
      if (!page)
        return sendError(response, 404, "NOT_FOUND", "Resource not found.");
      response.json({
        data: page.items,
        pagination: { next_cursor: page.next_cursor },
      });
    } catch (error) {
      handleError(response, error);
    }
  });
  return router;
}

export function createOpportunityRouter(
  createRepository: OpportunityRepositoryFactory,
  draftQueue?: DraftQueue,
  draftPromptVersion = "draft-v1",
): Router {
  const router = Router();
  router.post("/:id/draft", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    if (!draftQueue)
      return sendError(
        response,
        503,
        "DRAFTING_UNAVAILABLE",
        "Draft generation is temporarily unavailable.",
      );
    try {
      const opportunityId = idSchema.parse(
        (request.params as Record<string, string>).id,
      );
      const input = requestDraftSchema.parse(request.body ?? {});
      const repository = createRepository(authenticated.auth.accessToken);
      const result = await repository.requestDraft(
        authenticated.auth.userId,
        opportunityId,
        draftPromptVersion,
        crypto.randomUUID(),
        input.regenerate,
      );
      if (result.status === "not_found")
        return sendError(response, 404, "NOT_FOUND", "Resource not found.");
      if (result.status === "not_eligible")
        return sendError(
          response,
          422,
          "NOT_ELIGIBLE",
          "Only owned qualified opportunities can be drafted.",
        );
      if (result.status === "no_entitlement")
        return sendError(
          response,
          403,
          "NO_ENTITLEMENT",
          "An active entitlement is required.",
        );
      if (result.status === "quota_exhausted")
        return sendError(
          response,
          429,
          "DRAFT_QUOTA_EXHAUSTED",
          "Your draft quota has been reached.",
        );
      if (result.status === "already_completed")
        return response
          .status(409)
          .json({ data: { status: result.status, draft_id: result.draftId } });
      if (result.status !== "queued" && result.status !== "running")
        throw new Error("Unexpected draft request state.");
      try {
        await draftQueue.enqueue(result.operationId);
      } catch {
        await repository.cancelDraft(
          authenticated.auth.userId,
          result.operationId,
        );
        return sendError(
          response,
          503,
          "QUEUE_UNAVAILABLE",
          "Draft generation could not be queued. No quota was charged.",
        );
      }
      response.status(202).json({
        data: { status: result.status, operation_id: result.operationId },
      });
    } catch (error) {
      handleError(response, error);
    }
  });
  router.post("/:id/skip", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    try {
      const opportunityId = idSchema.parse(
        (request.params as Record<string, string>).id,
      );
      const input = skipOpportunitySchema.parse(request.body ?? {});
      const changed = await createRepository(
        authenticated.auth.accessToken,
      ).skip(authenticated.auth.userId, opportunityId, input.reason);
      if (!changed)
        return sendError(
          response,
          404,
          "NOT_FOUND",
          "Resource not found or cannot be changed.",
        );
      response.json({ data: { id: opportunityId, status: "skipped" } });
    } catch (error) {
      handleError(response, error);
    }
  });
  router.post("/:id/mark-posted", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    try {
      const opportunityId = idSchema.parse(
        (request.params as Record<string, string>).id,
      );
      const input = markOpportunityPostedSchema.parse(request.body ?? {});
      const changed = await createRepository(
        authenticated.auth.accessToken,
      ).markPosted(authenticated.auth.userId, opportunityId, input.posted_at);
      if (!changed)
        return sendError(
          response,
          404,
          "NOT_FOUND",
          "Resource not found or cannot be changed.",
        );
      response.json({
        data: {
          id: opportunityId,
          status: "posted",
          posted_at: input.posted_at ?? null,
        },
      });
    } catch (error) {
      handleError(response, error);
    }
  });
  return router;
}

export function createOperationRouter(
  createRepository: OpportunityRepositoryFactory,
): Router {
  const router = Router();
  router.get("/:id", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    try {
      const operationId = idSchema.parse(
        (request.params as Record<string, string>).id,
      );
      const operation = await createRepository(
        authenticated.auth.accessToken,
      ).getOperation(authenticated.auth.userId, operationId);
      if (!operation)
        return sendError(response, 404, "NOT_FOUND", "Resource not found.");
      response.json({ data: operation });
    } catch (error) {
      handleError(response, error);
    }
  });
  return router;
}

export function createDraftRouter(
  createRepository: OpportunityRepositoryFactory,
): Router {
  const router = Router();
  router.patch("/:id", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    try {
      const draftId = idSchema.parse(
        (request.params as Record<string, string>).id,
      );
      const input = updateDraftTextSchema.parse(request.body);
      const result = await createRepository(
        authenticated.auth.accessToken,
      ).updateDraft(
        authenticated.auth.userId,
        draftId,
        input.edited_text,
        input.expected_version,
      );
      if (result.status === "not_found")
        return sendError(response, 404, "NOT_FOUND", "Resource not found.");
      if (result.status === "conflict")
        return sendError(
          response,
          409,
          "VERSION_CONFLICT",
          "The draft changed. Reload it before saving again.",
        );
      if (result.status !== "updated")
        throw new Error("Unexpected draft update state.");
      response.json({ data: result.draft });
    } catch (error) {
      handleError(response, error);
    }
  });
  return router;
}
