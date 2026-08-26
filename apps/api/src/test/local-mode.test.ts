import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  assertLocalWorkspaceCanReset,
  createLocalDatabaseBackup,
  getLocalSchemaVersion,
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
  resetLocalWorkspaceDatabase,
} from "@mentionish/database";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import {
  createLocalInstallationVerifier,
  localOwnerId,
} from "../middleware/auth.js";
import { createLocalOpportunityRepositoryFactory } from "../opportunities/local-repository.js";
import { createLocalProductRepositoryFactory } from "../products/local-repository.js";
import { createLocalWorkspaceRepositoryFactory } from "../workspace/local-repository.js";
import { loadOrCreateLocalInstallationToken } from "../local/installation-token.js";
import { createLocalDataRouter } from "../local/data-routes.js";

const temporaryDirectories: string[] = [];

function bodyAs<T>(response: { body: unknown }): T {
  return response.body as T;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mentionish-local-api-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function localApp(databasePath: string, token: string) {
  const database = openLocalDatabase({ filePath: databasePath });
  const products = new LocalProductRepository(database);
  const discovery = new LocalDiscoveryRepository(database);
  const dataDirectory = dirname(databasePath);
  const backupsDirectory = join(dataDirectory, "backups");
  const app = createApp(
    createLocalInstallationVerifier(token),
    createLocalProductRepositoryFactory(products),
    "http://localhost:3000",
    createLocalOpportunityRepositoryFactory(products, discovery),
    undefined,
    "draft-v1",
    createLocalWorkspaceRepositoryFactory(products, discovery),
    {
      installationToken: token,
      status: () => ({
        runtime_mode: "local",
        schema_version: getLocalSchemaVersion(database),
        first_run:
          products.list().length === 0 && products.listArchived().length === 0,
      }),
      settings: () => ({ runtime_mode: "local" }),
    },
    undefined,
    undefined,
    createLocalDataRouter({
      dataDirectory,
      databasePath,
      backupsDirectory,
      schemaVersion: () => getLocalSchemaVersion(database),
      createBackup: () => createLocalDatabaseBackup(database, backupsDirectory),
      reset: async () => {
        assertLocalWorkspaceCanReset(database);
        const backup = await createLocalDatabaseBackup(
          database,
          backupsDirectory,
        );
        return {
          backup,
          cleared: resetLocalWorkspaceDatabase(database),
        };
      },
      openDataDirectory: () => undefined,
    }),
  );
  return { app, database };
}

describe("local API mode", () => {
  it("is the default and requires no hosted credentials", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      API_HOST: "127.0.0.1",
      API_PORT: 4000,
    });
  });

  it("creates and reuses a private installation token", () => {
    const directory = temporaryDirectory();
    const first = loadOrCreateLocalInstallationToken(directory);
    const second = loadOrCreateLocalInstallationToken(directory);

    expect(first.created).toBe(true);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toEqual({ ...first, created: false });
  });

  it("refuses a malformed existing installation token", () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, ".installation-token"), "not-a-token\n");
    expect(() => loadOrCreateLocalInstallationToken(directory)).toThrow(
      "installation token file is invalid",
    );
  });

  it("bootstraps only the configured dashboard origin", async () => {
    const databasePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const { app, database } = localApp(databasePath, "a".repeat(43));

    const denied = await request(app).post("/api/local/bootstrap").send({});
    const allowed = await request(app)
      .post("/api/local/bootstrap")
      .set("origin", "http://localhost:3000")
      .send({});

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(allowed.headers["cache-control"]).toBe("no-store");
    expect(allowed.body).toEqual({
      data: { mode: "local", token: "a".repeat(43) },
    });
    database.close();
  });

  it("protects local routes with the installation token", async () => {
    const databasePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const { app, database } = localApp(databasePath, "b".repeat(43));

    expect((await request(app).get("/api/products")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/products")
          .set("authorization", "Bearer " + "c".repeat(43))
      ).status,
    ).toBe(401);
    const authenticated = await request(app)
      .get("/api/me")
      .set("authorization", "Bearer " + "b".repeat(43));
    expect(authenticated.body).toEqual({ data: { id: localOwnerId } });
    database.close();
  });

  it("creates SQLite-backed products and reloads them after restart", async () => {
    const databasePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const token = "d".repeat(43);
    const first = localApp(databasePath, token);
    const created = await request(first.app)
      .post("/api/products")
      .set("authorization", "Bearer " + token)
      .send({
        name: "Local product",
        description: "Stored without Supabase.",
        keywords: ["customer problem", "reddit alternative"],
        phrases: [
          {
            phrase: "customer problem",
            kind: "problem",
            source: "ai_suggested",
            rationale: "Current pain language.",
          },
          {
            phrase: "reddit alternative",
            kind: "alternative",
            source: "manual",
            rationale: null,
          },
        ],
        voice_persona: null,
      });
    first.database.close();
    expect(created.status).toBe(201);
    const createdBody = bodyAs<{ data: { id: string } }>(created);
    expect(bodyAs<{ data: unknown }>(created).data).toMatchObject({
      user_id: localOwnerId,
      name: "Local product",
      keywords: ["customer problem", "reddit alternative"],
      phrases: [
        {
          phrase: "customer problem",
          kind: "problem",
          source: "ai_suggested",
          rationale: "Current pain language.",
        },
        {
          phrase: "reddit alternative",
          kind: "alternative",
          source: "manual",
          rationale: null,
        },
      ],
    });

    const reopened = localApp(databasePath, token);
    const listed = await request(reopened.app)
      .get("/api/products")
      .set("authorization", "Bearer " + token);
    expect(listed.status).toBe(200);
    const listedBody = bodyAs<{ data: Array<{ id: string }> }>(listed);
    expect(listedBody.data).toHaveLength(1);
    expect(listedBody.data[0]?.id).toBe(createdBody.data.id);
    expect(
      bodyAs<{ data: Array<{ phrases?: unknown[] }> }>(listed).data[0]?.phrases,
    ).toHaveLength(2);

    const opportunities = await request(reopened.app)
      .get(`/api/products/${createdBody.data.id}/opportunities`)
      .set("authorization", "Bearer " + token);
    reopened.database.close();
    expect(opportunities.status).toBe(200);
    expect(bodyAs<{ data: unknown[] }>(opportunities).data).toEqual([]);
  });

  it("serves local status, settings, and analytics", async () => {
    const databasePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const token = "e".repeat(43);
    const { app, database } = localApp(databasePath, token);
    const authorization = "Bearer " + token;

    const [status, settings, analytics] = await Promise.all([
      request(app).get("/api/local/status").set("authorization", authorization),
      request(app).get("/api/settings").set("authorization", authorization),
      request(app)
        .get("/api/analytics/summary?window=7d")
        .set("authorization", authorization),
    ]);

    expect(bodyAs<{ data: unknown }>(status).data).toMatchObject({
      runtime_mode: "local",
      schema_version: 14,
      first_run: true,
    });
    expect(bodyAs<{ data: unknown }>(settings).data).toEqual({
      runtime_mode: "local",
    });
    expect(bodyAs<{ data: unknown }>(analytics).data).toMatchObject({
      found: 0,
      qualified: 0,
    });
    database.close();
  });

  it("downloads verified backups and requires typed reset confirmation", async () => {
    const databasePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const token = "f".repeat(43);
    const { app, database } = localApp(databasePath, token);
    const authorization = "Bearer " + token;
    new LocalProductRepository(database).create({
      name: "Reset test",
      description: "Must be preserved in the automatic safety backup.",
      phrases: [{ phrase: "safe local reset", kind: "problem" }],
    });

    const backup = await request(app)
      .post("/api/local/data/backups")
      .set("authorization", authorization)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(backup.status).toBe(200);
    expect(backup.headers["content-disposition"]).toContain("attachment");
    expect((backup.body as Buffer).subarray(0, 15).toString()).toBe(
      "SQLite format 3",
    );

    const refused = await request(app)
      .post("/api/local/data/reset")
      .set("authorization", authorization)
      .send({ confirmation: "reset" });
    expect(refused.status).toBe(400);

    const reset = await request(app)
      .post("/api/local/data/reset")
      .set("authorization", authorization)
      .send({ confirmation: "RESET" });
    expect(reset.status).toBe(200);
    const resetBody = bodyAs<{
      data: { backup_filename: string; cleared: { products: number } };
    }>(reset);
    expect(resetBody.data.backup_filename).toMatch(/^mentionish-.*\.sqlite3$/);
    expect(resetBody.data.cleared.products).toBe(1);
    expect(new LocalProductRepository(database).list()).toEqual([]);
    database.close();
  });
});
