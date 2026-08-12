import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { timingSafeEqual } from "node:crypto";
import type { HostedApiConfig } from "../config.js";

export interface AuthenticatedRequest extends Request {
  auth: { userId: string; accessToken: string };
}

export type AccessTokenVerifier = (
  token: string,
) => Promise<{ userId: string }>;

function getRequestId(response: Response): string {
  const value = response.getHeader("x-request-id");
  return typeof value === "string" ? value : "unknown";
}

export function createSupabaseVerifier(
  config: HostedApiConfig,
): AccessTokenVerifier {
  const jwks = createRemoteJWKSet(
    new URL(`${config.SUPABASE_JWT_ISSUER}/.well-known/jwks.json`),
  );
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.SUPABASE_JWT_ISSUER,
      audience: config.SUPABASE_JWT_AUDIENCE,
    });
    if (!payload.sub) throw new Error("Token has no subject");
    return { userId: payload.sub };
  };
}

export function requireAuth(verify: AccessTokenVerifier) {
  return async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      response.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
          request_id: getRequestId(response),
          details: {},
        },
      });
      return;
    }

    const token = header.slice("Bearer ".length);
    try {
      const { userId } = await verify(token);
      (request as AuthenticatedRequest).auth = { userId, accessToken: token };
      next();
    } catch {
      response.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "The access token is invalid or expired.",
          request_id: getRequestId(response),
          details: {},
        },
      });
    }
  };
}

export const localOwnerId = "00000000-0000-4000-8000-000000000001";

export function createLocalInstallationVerifier(
  installationToken: string,
): AccessTokenVerifier {
  const expected = Buffer.from(installationToken);
  return (token) => {
    const received = Buffer.from(token);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return Promise.reject(new Error("Invalid installation token."));
    }
    return Promise.resolve({ userId: localOwnerId });
  };
}
