import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type {
  AccessTokenVerifier,
  AuthenticatedRequest,
} from "./middleware/auth.js";
import { requireAuth } from "./middleware/auth.js";
import type { ProductRepositoryFactory } from "./products/repository.js";
import { createProductRouter } from "./products/routes.js";

export function createApp(
  verifyAccessToken: AccessTokenVerifier,
  createProductRepository: ProductRepositoryFactory,
  dashboardOrigin = "http://localhost:3000",
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || origin === dashboardOrigin),
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use((_request, response, next) => {
    const requestId = crypto.randomUUID();
    response.setHeader("x-request-id", requestId);
    next();
  });

  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.use(
    "/api/products",
    requireAuth(verifyAccessToken),
    createProductRouter(createProductRepository),
  );

  app.get("/api/me", requireAuth(verifyAccessToken), (request, response) => {
    const { userId } = (request as AuthenticatedRequest).auth;
    response.json({ data: { id: userId } });
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found.",
        request_id: response.getHeader("x-request-id"),
        details: {},
      },
    });
  });
  return app;
}
