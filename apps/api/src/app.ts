import crypto from "node:crypto";
import cors from "cors";
import express, { type Router } from "express";
import helmet from "helmet";
import type {
  AccessTokenVerifier,
  AuthenticatedRequest,
} from "./middleware/auth.js";
import { requireAuth } from "./middleware/auth.js";
import type { ProductRepositoryFactory } from "./products/repository.js";
import { createProductRouter } from "./products/routes.js";
import type { OpportunityRepositoryFactory } from "./opportunities/repository.js";
import type { DraftQueue } from "./opportunities/draft-queue.js";
import {
  createDraftRouter,
  createOperationRouter,
  createOpportunityRouter,
  createProductOpportunityRouter,
} from "./opportunities/routes.js";
import type { WorkspaceRepositoryFactory } from "./workspace/repository.js";
import { createWorkspaceRouter } from "./workspace/routes.js";

export interface LocalRuntimeRoutes {
  installationToken: string;
  status: () => Record<string, unknown>;
  settings: () => Record<string, unknown>;
}

function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

export function createApp(
  verifyAccessToken: AccessTokenVerifier,
  createProductRepository: ProductRepositoryFactory,
  dashboardOrigin = "http://localhost:3000",
  createOpportunityRepository?: OpportunityRepositoryFactory,
  draftQueue?: DraftQueue,
  draftPromptVersion = "draft-v1",
  createWorkspaceRepository?: WorkspaceRepositoryFactory,
  localRuntime?: LocalRuntimeRoutes,
  localAiRouter?: Router,
  localScanRouter?: Router,
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

  if (localRuntime) {
    app.post("/api/local/bootstrap", (request, response) => {
      if (
        request.header("origin") !== dashboardOrigin ||
        !isLoopbackAddress(request.socket.remoteAddress)
      ) {
        response.status(403).json({
          error: {
            code: "LOCAL_BOOTSTRAP_FORBIDDEN",
            message:
              "Local bootstrap is available only to the configured loopback dashboard.",
            request_id: response.getHeader("x-request-id"),
            details: {},
          },
        });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json({
        data: { mode: "local", token: localRuntime.installationToken },
      });
    });

    app.get(
      "/api/local/status",
      requireAuth(verifyAccessToken),
      (_request, response) => {
        response.setHeader("cache-control", "no-store");
        response.json({ data: localRuntime.status() });
      },
    );
    app.get(
      "/api/settings",
      requireAuth(verifyAccessToken),
      (_request, response) => {
        response.setHeader("cache-control", "no-store");
        response.json({ data: localRuntime.settings() });
      },
    );
  }

  if (localAiRouter) {
    app.use("/api/ai", requireAuth(verifyAccessToken), localAiRouter);
  }
  if (localScanRouter) {
    app.use("/api/scans", requireAuth(verifyAccessToken), localScanRouter);
  }

  if (createOpportunityRepository) {
    app.use(
      "/api/products/:id/opportunities",
      requireAuth(verifyAccessToken),
      createProductOpportunityRouter(createOpportunityRepository),
    );
    app.use(
      "/api/opportunities",
      requireAuth(verifyAccessToken),
      createOpportunityRouter(
        createOpportunityRepository,
        draftQueue,
        draftPromptVersion,
      ),
    );
    app.use(
      "/api/operations",
      requireAuth(verifyAccessToken),
      createOperationRouter(createOpportunityRepository),
    );
    app.use(
      "/api/drafts",
      requireAuth(verifyAccessToken),
      createDraftRouter(createOpportunityRepository),
    );
  }
  if (createWorkspaceRepository) {
    app.use(
      "/api",
      requireAuth(verifyAccessToken),
      createWorkspaceRouter(createWorkspaceRepository),
    );
  }
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
