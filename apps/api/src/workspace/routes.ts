import { analyticsQuerySchema } from "@mentionish/types";
import { Router, type Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import {
  WorkspaceRepositoryError,
  type WorkspaceRepositoryFactory,
} from "./repository.js";

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
    return sendError(
      response,
      400,
      "VALIDATION_ERROR",
      "The request is invalid.",
    );
  }
  if (error instanceof WorkspaceRepositoryError) {
    return sendError(
      response,
      503,
      "DATABASE_UNAVAILABLE",
      "Workspace data is temporarily unavailable.",
    );
  }
  return sendError(
    response,
    503,
    "DATABASE_UNAVAILABLE",
    "Workspace data is temporarily unavailable.",
  );
}

export function createWorkspaceRouter(
  createRepository: WorkspaceRepositoryFactory,
): Router {
  const router = Router();
  router.get("/analytics/summary", async (request, response) => {
    const authenticated = request as unknown as AuthenticatedRequest;
    try {
      const query = analyticsQuerySchema.parse(request.query);
      const data = await createRepository(
        authenticated.auth.accessToken,
      ).analytics(
        authenticated.auth.userId,
        query.product_id,
        query.window === "30d" ? 30 : 7,
      );
      if (!data)
        return sendError(response, 404, "NOT_FOUND", "Resource not found.");
      response.json({ data });
    } catch (error) {
      handleError(response, error);
    }
  });
  return router;
}
