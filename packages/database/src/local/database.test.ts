import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalDatabaseBackup } from "./backup.js";
import { openLocalDatabase } from "./database.js";
import {
  getLocalSchemaVersion,
  localMigrations,
  runLocalMigrations,
} from "./migrations.js";
import { LocalDiscoveryRepository } from "./discovery.js";
import {
  LocalProductRepository,
  LocalProductRepositoryError,
} from "./products.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mentionish-local-db-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local database", () => {
  it("bootstraps migrations with SQLite safety pragmas and is idempotent", () => {
    const filePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const first = openLocalDatabase({
      filePath,
      installationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(getLocalSchemaVersion(first)).toBe(9);
    expect(first.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(first.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(
      first
        .prepare<[], { count: number }>(
          "SELECT count(*) AS count FROM schema_migrations",
        )
        .get()?.count,
    ).toBe(9);
    first.close();

    const reopened = openLocalDatabase({
      filePath,
      installationId: "22222222-2222-4222-8222-222222222222",
    });
    expect(getLocalSchemaVersion(reopened)).toBe(9);
    expect(
      reopened
        .prepare<[], { installation_id: string }>(
          "SELECT installation_id FROM app_meta WHERE id = 1",
        )
        .get()?.installation_id,
    ).toBe("11111111-1111-4111-8111-111111111111");
    reopened.close();
  });

  it("upgrades an existing Phase 4 database with zeroed scan funnel counters", () => {
    const filePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const phaseFour = openLocalDatabase({ filePath, migrate: false });
    runLocalMigrations(
      phaseFour,
      "11111111-1111-4111-8111-111111111111",
      localMigrations.slice(0, 2),
    );
    expect(getLocalSchemaVersion(phaseFour)).toBe(2);
    phaseFour.close();

    const upgraded = openLocalDatabase({ filePath });
    expect(getLocalSchemaVersion(upgraded)).toBe(9);
    const columns = upgraded
      .prepare("PRAGMA table_info(scan_runs)")
      .all()
      .map((column) => (column as { name: string }).name);
    expect(columns).toEqual(
      expect.arrayContaining([
        "reddit_items_fetched",
        "hackernews_items_fetched",
        "candidates_matched",
        "candidates_rejected",
        "candidates_qualified",
        "candidates_direct",
        "candidates_helpful",
        "candidates_market_signals",
        "reddit_candidates_matched",
        "reddit_candidates_rejected",
        "reddit_candidates_qualified",
        "hackernews_candidates_matched",
        "hackernews_candidates_rejected",
        "hackernews_candidates_qualified",
        "queries_explored",
        "queries_reused",
        "plan_summary",
      ]),
    );
    expect(
      upgraded
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='scan_candidate_evaluations'",
        )
        .get(),
    ).toEqual({ count: 1 });
    upgraded.close();
  });

  it("persists products and first-class phrases across restart", () => {
    const filePath = join(temporaryDirectory(), "mentionish.sqlite3");
    const first = openLocalDatabase({ filePath });
    const repository = new LocalProductRepository(first);
    const created = repository.create({
      name: "  Mentionish  ",
      description: " Find useful customer conversations. ",
      audience: "Solo founders",
      discoveryProfile: {
        audiences: ["solo founders"],
        problems: ["cannot find relevant customer conversations"],
        situations: ["recent product launch"],
        desired_outcomes: ["find useful conversations"],
        alternatives: ["manual community research"],
        buying_signals: ["asks for a social listening tool"],
        helpful_signals: ["asks how to find customers"],
        market_signals: ["manual research takes too long"],
        exclusions: ["generic AI model discussion"],
        communities: ["Hacker News"],
      },
      url: "https://mentionish.example",
      phrases: [
        {
          phrase: "  Find Reddit customers  ",
          kind: "problem",
          rationale: "Captures an explicit discovery problem.",
        },
        {
          phrase: "Alternative to social listening",
          kind: "alternative",
          source: "ai_suggested",
        },
      ],
    });
    first.close();

    const reopened = openLocalDatabase({ filePath });
    const persisted = new LocalProductRepository(reopened).get(created.id);
    expect(persisted).toMatchObject({
      id: created.id,
      name: "Mentionish",
      description: "Find useful customer conversations.",
      audience: "Solo founders",
      isActive: true,
    });
    expect(persisted?.discoveryProfile?.problems).toEqual([
      "cannot find relevant customer conversations",
    ]);
    expect(persisted?.discoveryProfile?.exclusions).toEqual([
      "generic AI model discussion",
    ]);
    expect(persisted?.phrases).toHaveLength(2);
    expect(persisted?.phrases[0]?.normalizedPhrase).toBe(
      "find reddit customers",
    );
    expect(persisted?.phrases[1]?.normalizedPhrase).toBe(
      "alternative to social listening",
    );
    reopened.close();
  });

  it("updates phrases and supports archive and restore", () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const repository = new LocalProductRepository(database);
    const product = repository.create({
      name: "Product",
      description: "Initial description",
      phrases: [{ phrase: "initial problem", kind: "problem" }],
    });

    const updated = repository.update(product.id, {
      description: "Updated description",
      phrases: [
        { phrase: "replacement question", kind: "question" },
        { phrase: "wrong audience", kind: "exclusion" },
      ],
    });
    expect(updated?.description).toBe("Updated description");
    expect(updated?.phrases.map((phrase) => phrase.kind)).toEqual([
      "question",
      "exclusion",
    ]);

    expect(repository.softDelete(product.id)).toBe(true);
    expect(repository.list()).toEqual([]);
    expect(repository.listArchived()).toHaveLength(1);
    expect(repository.restore(product.id)?.isActive).toBe(true);
    expect(repository.list()).toHaveLength(1);
    database.close();
  });

  it("rejects duplicate active normalized phrases before writing", () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const repository = new LocalProductRepository(database);

    expect(() =>
      repository.create({
        name: "Product",
        description: "Description",
        phrases: [
          { phrase: "Customer Problem", kind: "problem" },
          { phrase: "  customer   problem ", kind: "problem" },
        ],
      }),
    ).toThrowError(LocalProductRepositoryError);
    expect(repository.list()).toEqual([]);
    database.close();
  });

  it("creates an integrity-checked backup that can be opened", async () => {
    const directory = temporaryDirectory();
    const filePath = join(directory, "mentionish.sqlite3");
    const database = openLocalDatabase({ filePath });
    const product = new LocalProductRepository(database).create({
      name: "Backed up product",
      description: "Survives a verified SQLite online backup.",
      phrases: [{ phrase: "backup sqlite", kind: "category" }],
    });

    const backup = await createLocalDatabaseBackup(
      database,
      join(directory, "backups"),
      new Date("2026-08-07T12:00:00.000Z"),
    );
    expect(backup.bytes).toBeGreaterThan(0);
    expect(backup.schemaVersion).toBe(9);
    expect(readFileSync(backup.path).subarray(0, 15).toString()).toBe(
      "SQLite format 3",
    );

    const restored = openLocalDatabase({
      filePath: backup.path,
      readonly: true,
      fileMustExist: true,
      migrate: false,
    });
    expect(new LocalProductRepository(restored).get(product.id)?.name).toBe(
      "Backed up product",
    );
    restored.close();
    database.close();
  });

  it("retains candidate audits only for the configured number of recent scans", () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Audit product",
      description: "Tests bounded candidate evidence.",
      phrases: [{ phrase: "customer discovery", kind: "problem" }],
    });
    const discovery = new LocalDiscoveryRepository(database);
    for (let index = 0; index < 3; index += 1) {
      const scan = discovery.createScan("product", [product.id], 1);
      discovery.saveClassification(
        scan.id,
        product.id,
        {
          platform: "hackernews",
          externalId: `candidate-${index}`,
          itemType: "story",
          title: "Need customer discovery help",
          body: "How do founders find useful conversations?",
          url: `https://news.ycombinator.com/item?id=${index}`,
        },
        ["customer discovery"],
        "customer discovery help",
        {
          overallScore: 40,
          label: "rejected",
          tier: "irrelevant",
          audienceFit: 50,
          problemFit: 40,
          solutionSeeking: 30,
          buyingIntent: 20,
          replyAppropriateness: 50,
          reasoning: "Related but not solution seeking.",
        },
        "rejected",
      );
    }
    discovery.pruneCandidateAudits(2);
    expect(
      database
        .prepare("SELECT count(*) AS count FROM scan_candidate_evaluations")
        .get(),
    ).toEqual({ count: 2 });
    expect(
      database.prepare("SELECT count(*) AS count FROM scanned_posts").get(),
    ).toEqual({ count: 2 });
    database.close();
  });

  it("retains aggregate query outcomes as adaptive discovery memory", () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Adaptive product",
      description: "Learns which searches find relevant conversations.",
      phrases: [{ phrase: "customer discovery", kind: "problem" }],
    });
    const discovery = new LocalDiscoveryRepository(database);
    const scan = discovery.createScan("product", [product.id], 1);
    discovery.recordQueryRun({
      scanId: scan.id,
      productId: product.id,
      platform: "hackernews",
      query: "Finding early adopters",
      strategy: "explore",
      itemsFetched: 20,
      candidatesReviewed: 4,
      candidatesQualified: 1,
    });
    discovery.recordQueryRun({
      scanId: scan.id,
      productId: product.id,
      platform: "hackernews",
      query: "finding early adopters",
      strategy: "proven",
      itemsFetched: 15,
      candidatesReviewed: 2,
      candidatesQualified: 1,
    });
    expect(discovery.recentQueryMemory(product.id, "hackernews")).toEqual([
      expect.objectContaining({
        normalizedQuery: "finding early adopters",
        timesUsed: 2,
        itemsFetched: 35,
        candidatesReviewed: 6,
        candidatesQualified: 2,
      }),
    ]);
    database.close();
  });

  it("refuses a database created by a newer application schema", () => {
    const filePath = join(temporaryDirectory(), "newer.sqlite3");
    const database = new Database(filePath);
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations(version, name, checksum, applied_at)
      VALUES (10, 'future', 'future', '2026-08-07T00:00:00.000Z');
    `);
    database.close();

    expect(() => openLocalDatabase({ filePath })).toThrow(
      "is newer than this application supports",
    );
  });
});
