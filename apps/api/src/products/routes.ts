import { createProductSchema, updateProductSchema } from "@mentionish/types";
import { Router, type Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import {
  ProductRepositoryError,
  type ProductRepositoryFactory,
} from "./repository.js";

const productIdSchema = z.string().uuid();

function requestId(response: Response): string {
  const value = response.getHeader("x-request-id");
  return typeof value === "string" ? value : "unknown";
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): void {
  response.status(status).json({
    error: {
      code,
      message,
      request_id: requestId(response),
      details,
    },
  });
}

function handleError(response: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    sendError(response, 400, "VALIDATION_ERROR", "The request is invalid.", {
      issues: error.issues,
    });
    return;
  }
  if (error instanceof ProductRepositoryError) {
    if (error.code === "PRODUCT_LIMIT_REACHED") {
      sendError(response, 403, error.code, error.message);
      return;
    }
    if (error.code === "KEYWORD_LIMIT_REACHED") {
      sendError(response, 400, error.code, error.message);
      return;
    }
  }
  sendError(
    response,
    503,
    "DATABASE_UNAVAILABLE",
    "The product service is temporarily unavailable.",
  );
}

export function createProductRouter(
  createRepository: ProductRepositoryFactory,
): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const products = await createRepository(accessToken).list(userId);
      response.json({ data: products });
    } catch (error) {
      handleError(response, error);
    }
  });

  router.post("/", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const input = createProductSchema.parse(request.body);
      const product = await createRepository(accessToken).create(userId, input);
      response.status(201).json({ data: product });
    } catch (error) {
      handleError(response, error);
    }
  });

  router.get("/archived", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const products = await createRepository(accessToken).listArchived(userId);
      response.json({ data: products });
    } catch (error) {
      handleError(response, error);
    }
  });

  router.post("/:id/restore", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const productId = productIdSchema.parse(request.params.id);
      const product = await createRepository(accessToken).restore(
        userId,
        productId,
      );
      if (!product) {
        sendError(response, 404, "NOT_FOUND", "Resource not found.");
        return;
      }
      response.json({ data: product });
    } catch (error) {
      handleError(response, error);
    }
  });

  router.get("/:id", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const productId = productIdSchema.parse(request.params.id);
      const product = await createRepository(accessToken).get(
        userId,
        productId,
      );
      if (!product) {
        sendError(response, 404, "NOT_FOUND", "Resource not found.");
        return;
      }
      response.json({ data: product });
    } catch (error) {
      handleError(response, error);
    }
  });

  router.patch("/:id", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const productId = productIdSchema.parse(request.params.id);
      const input = updateProductSchema.parse(request.body);
      const product = await createRepository(accessToken).update(
        userId,
        productId,
        input,
      );
      if (!product) {
        sendError(response, 404, "NOT_FOUND", "Resource not found.");
        return;
      }
      response.json({ data: product });
    } catch (error) {
      handleError(response, error);
    }
  });

  router.delete("/:id", async (request, response) => {
    const authenticatedRequest = request as unknown as AuthenticatedRequest;
    const { userId, accessToken } = authenticatedRequest.auth;
    try {
      const productId = productIdSchema.parse(request.params.id);
      const deleted = await createRepository(accessToken).softDelete(
        userId,
        productId,
      );
      if (!deleted) {
        sendError(response, 404, "NOT_FOUND", "Resource not found.");
        return;
      }
      response.status(204).send();
    } catch (error) {
      handleError(response, error);
    }
  });

  return router;
}
