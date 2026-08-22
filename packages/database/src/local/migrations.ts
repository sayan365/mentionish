import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export interface LocalMigration {
  version: number;
  name: string;
  sql: string;
}

const initialSchema = `
CREATE TABLE app_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  installation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  non_secret_value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 4000),
  audience TEXT,
  url TEXT,
  voice_persona TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE product_phrases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL CHECK (length(trim(phrase)) BETWEEN 2 AND 200),
  normalized_phrase TEXT NOT NULL CHECK (length(trim(normalized_phrase)) BETWEEN 2 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('problem', 'question', 'alternative', 'category', 'audience', 'exclusion')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai_suggested')),
  rationale TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX products_active_updated_idx
  ON products(is_active, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX products_archived_updated_idx
  ON products(deleted_at, updated_at DESC)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX product_phrases_product_idx
  ON product_phrases(product_id, is_active, kind);
CREATE UNIQUE INDEX product_phrases_active_unique_idx
  ON product_phrases(product_id, kind, normalized_phrase)
  WHERE is_active = 1;
`;

const manualDiscoverySchema = `
CREATE TABLE scanned_posts (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK (platform IN ('reddit','hackernews')),
  external_id TEXT NOT NULL, item_type TEXT NOT NULL CHECK (item_type IN ('story','comment')),
  parent_external_id TEXT, thread_external_id TEXT, subreddit TEXT, title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '', author TEXT, url TEXT NOT NULL, source_created_at TEXT,
  scanned_at TEXT NOT NULL, source_checked_at TEXT NOT NULL, source_updated_at TEXT,
  raw_metadata_json TEXT NOT NULL DEFAULT '{}', is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  UNIQUE(platform, external_id)
);
CREATE TABLE opportunities (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  scanned_post_id TEXT NOT NULL REFERENCES scanned_posts(id) ON DELETE CASCADE,
  matched_phrases_json TEXT NOT NULL DEFAULT '[]', intent_score INTEGER CHECK (intent_score BETWEEN 0 AND 100),
  reasoning TEXT, status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('unclassified','new','drafted','posted','skipped')),
  classified_at TEXT, posted_at TEXT, skipped_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(product_id, scanned_post_id)
);
CREATE TABLE scan_runs (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('all','product')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','cancelling','cancelled','succeeded','failed')),
  product_ids_json TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'hackernews' CHECK (platform='hackernews'),
  queries_total INTEGER NOT NULL DEFAULT 0, queries_completed INTEGER NOT NULL DEFAULT 0,
  items_fetched INTEGER NOT NULL DEFAULT 0, opportunities_found INTEGER NOT NULL DEFAULT 0,
  current_message TEXT NOT NULL DEFAULT '', error_code TEXT, error_message TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
  created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX scanned_posts_recent_idx ON scanned_posts(platform,source_created_at DESC);
CREATE INDEX opportunities_product_feed_idx ON opportunities(product_id,status,intent_score DESC,created_at DESC);
CREATE INDEX scan_runs_recent_idx ON scan_runs(created_at DESC);
`;
const scanObservabilitySchema = `
ALTER TABLE scan_runs ADD COLUMN reddit_items_fetched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN hackernews_items_fetched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN candidates_matched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN candidates_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN candidates_qualified INTEGER NOT NULL DEFAULT 0;
`;

const candidateAuditSchema = `
ALTER TABLE scan_runs ADD COLUMN reddit_candidates_matched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN reddit_candidates_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN reddit_candidates_qualified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN hackernews_candidates_matched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN hackernews_candidates_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN hackernews_candidates_qualified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE scan_candidate_evaluations (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  scanned_post_id TEXT NOT NULL REFERENCES scanned_posts(id) ON DELETE CASCADE,
  matched_phrases_json TEXT NOT NULL DEFAULT '[]',
  intent_score INTEGER NOT NULL CHECK (intent_score BETWEEN 0 AND 100),
  reasoning TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('rejected','qualified')),
  created_at TEXT NOT NULL,
  UNIQUE(scan_id, product_id, scanned_post_id)
);
CREATE INDEX scan_candidate_evaluations_scan_idx
  ON scan_candidate_evaluations(scan_id, intent_score DESC, created_at DESC);
`;

const qualificationDimensionsSchema = `
ALTER TABLE opportunities ADD COLUMN qualification_label TEXT NOT NULL DEFAULT 'worth_helping'
  CHECK (qualification_label IN ('worth_helping','potential_buyer'));
ALTER TABLE opportunities ADD COLUMN audience_fit INTEGER CHECK (audience_fit BETWEEN 0 AND 100);
ALTER TABLE opportunities ADD COLUMN problem_fit INTEGER CHECK (problem_fit BETWEEN 0 AND 100);
ALTER TABLE opportunities ADD COLUMN solution_seeking INTEGER CHECK (solution_seeking BETWEEN 0 AND 100);
ALTER TABLE opportunities ADD COLUMN buying_intent INTEGER CHECK (buying_intent BETWEEN 0 AND 100);
ALTER TABLE opportunities ADD COLUMN reply_appropriateness INTEGER CHECK (reply_appropriateness BETWEEN 0 AND 100);
ALTER TABLE scan_candidate_evaluations ADD COLUMN qualification_label TEXT
  CHECK (qualification_label IN ('rejected','worth_helping','potential_buyer'));
ALTER TABLE scan_candidate_evaluations ADD COLUMN audience_fit INTEGER CHECK (audience_fit BETWEEN 0 AND 100);
ALTER TABLE scan_candidate_evaluations ADD COLUMN problem_fit INTEGER CHECK (problem_fit BETWEEN 0 AND 100);
ALTER TABLE scan_candidate_evaluations ADD COLUMN solution_seeking INTEGER CHECK (solution_seeking BETWEEN 0 AND 100);
ALTER TABLE scan_candidate_evaluations ADD COLUMN buying_intent INTEGER CHECK (buying_intent BETWEEN 0 AND 100);
ALTER TABLE scan_candidate_evaluations ADD COLUMN reply_appropriateness INTEGER CHECK (reply_appropriateness BETWEEN 0 AND 100);
UPDATE scan_candidate_evaluations
   SET qualification_label = CASE
     WHEN decision = 'qualified' THEN 'worth_helping'
     ELSE 'rejected'
   END;
`;

const adaptiveDiscoverySchema = `
ALTER TABLE scan_runs ADD COLUMN queries_explored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN queries_reused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN plan_summary TEXT NOT NULL DEFAULT '';

CREATE TABLE discovery_query_runs (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('reddit','hackernews')),
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('explore','proven','rotate','fallback')),
  items_fetched INTEGER NOT NULL DEFAULT 0,
  candidates_reviewed INTEGER NOT NULL DEFAULT 0,
  candidates_qualified INTEGER NOT NULL DEFAULT 0,
  executed_at TEXT NOT NULL
);
CREATE INDEX discovery_query_runs_product_idx
  ON discovery_query_runs(product_id,platform,executed_at DESC);
CREATE INDEX discovery_query_runs_scan_idx
  ON discovery_query_runs(scan_id,platform);
`;

const discoveryTiersSchema = `
ALTER TABLE scan_candidate_evaluations ADD COLUMN discovery_tier TEXT NOT NULL DEFAULT 'irrelevant'
  CHECK (discovery_tier IN ('direct_opportunity','helpful_conversation','market_signal','irrelevant'));
ALTER TABLE scan_candidate_evaluations ADD COLUMN need_scope TEXT NOT NULL DEFAULT 'unrelated'
  CHECK (need_scope IN ('core','adjacent','unrelated'));
ALTER TABLE scan_candidate_evaluations ADD COLUMN author_state TEXT NOT NULL DEFAULT 'sharing'
  CHECK (author_state IN ('asking','comparing','sharing','promoting'));
ALTER TABLE scan_candidate_evaluations ADD COLUMN market_research_value INTEGER NOT NULL DEFAULT 0
  CHECK (market_research_value BETWEEN 0 AND 100);
ALTER TABLE scan_candidate_evaluations ADD COLUMN source_query TEXT;

ALTER TABLE opportunities ADD COLUMN discovery_tier TEXT NOT NULL DEFAULT 'helpful_conversation'
  CHECK (discovery_tier IN ('direct_opportunity','helpful_conversation'));

UPDATE scan_candidate_evaluations
   SET discovery_tier = CASE qualification_label
     WHEN 'potential_buyer' THEN 'direct_opportunity'
     WHEN 'worth_helping' THEN 'helpful_conversation'
     ELSE 'irrelevant'
   END;
UPDATE opportunities
   SET discovery_tier = CASE qualification_label
     WHEN 'potential_buyer' THEN 'direct_opportunity'
     ELSE 'helpful_conversation'
   END;
`;

const discoveryTierCountersSchema = `
ALTER TABLE scan_runs ADD COLUMN candidates_direct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN candidates_helpful INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_runs ADD COLUMN candidates_market_signals INTEGER NOT NULL DEFAULT 0;
`;

const productDiscoveryProfileSchema = `
ALTER TABLE products ADD COLUMN discovery_profile_json TEXT;
`;

const conversationFeedbackSchema = `
CREATE TABLE conversation_feedback (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('useful','not_relevant')),
  reason TEXT NOT NULL CHECK (reason IN (
    'strong_problem','clear_intent','good_audience','actionable',
    'wrong_audience','wrong_problem','weak_intent','promotional',
    'outdated','duplicate','missing_context','other'
  )),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL
);
CREATE INDEX conversation_feedback_opportunity_idx
  ON conversation_feedback(opportunity_id, created_at DESC);
CREATE INDEX conversation_feedback_product_idx
  ON conversation_feedback(product_id, created_at DESC);
`;

export const localMigrations: readonly LocalMigration[] = [
  { version: 1, name: "initial_local_products", sql: initialSchema },
  { version: 2, name: "manual_discovery", sql: manualDiscoverySchema },
  { version: 3, name: "scan_observability", sql: scanObservabilitySchema },
  { version: 4, name: "candidate_audit", sql: candidateAuditSchema },
  {
    version: 5,
    name: "qualification_dimensions",
    sql: qualificationDimensionsSchema,
  },
  {
    version: 6,
    name: "adaptive_discovery_memory",
    sql: adaptiveDiscoverySchema,
  },
  {
    version: 7,
    name: "discovery_value_tiers",
    sql: discoveryTiersSchema,
  },
  {
    version: 8,
    name: "discovery_tier_counters",
    sql: discoveryTierCountersSchema,
  },
  {
    version: 9,
    name: "product_discovery_profile",
    sql: productDiscoveryProfileSchema,
  },
  {
    version: 10,
    name: "conversation_feedback",
    sql: conversationFeedbackSchema,
  },
];

interface AppliedMigrationRow {
  version: number;
  name: string;
  checksum: string;
}

interface VersionRow {
  schema_version: number;
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function assertMigrationSequence(migrations: readonly LocalMigration[]): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(
        `Local migration sequence is invalid: expected ${expected}, received ${migration.version}.`,
      );
    }
  });
}

export function runLocalMigrations(
  database: Database.Database,
  installationId: string,
  migrations: readonly LocalMigration[] = localMigrations,
): number {
  assertMigrationSequence(migrations);
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = database
    .prepare<[], AppliedMigrationRow>(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    )
    .all();
  const latestSupported = migrations.at(-1)?.version ?? 0;
  const unexpected = applied.find((entry) => entry.version > latestSupported);
  if (unexpected) {
    throw new Error(
      `Database schema version ${unexpected.version} is newer than this application supports (${latestSupported}).`,
    );
  }

  for (const entry of applied) {
    const migration = migrations[entry.version - 1];
    if (
      !migration ||
      migration.name !== entry.name ||
      checksum(migration.sql) !== entry.checksum
    ) {
      throw new Error(
        `Local migration ${entry.version} does not match the application migration history.`,
      );
    }
  }

  const insertMigration = database.prepare<[number, string, string, string]>(
    "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
  );

  for (const migration of migrations.slice(applied.length)) {
    const apply = database.transaction(() => {
      database.exec(migration.sql);
      const now = new Date().toISOString();
      insertMigration.run(
        migration.version,
        migration.name,
        checksum(migration.sql),
        now,
      );
      if (migration.version === 1) {
        database
          .prepare<[number, string, string, string]>(
            "INSERT INTO app_meta(id, schema_version, installation_id, created_at, updated_at) VALUES (1, ?, ?, ?, ?)",
          )
          .run(migration.version, installationId, now, now);
      } else {
        database
          .prepare<[number, string]>(
            "UPDATE app_meta SET schema_version = ?, updated_at = ? WHERE id = 1",
          )
          .run(migration.version, now);
      }
    });
    apply.immediate();
  }

  return getLocalSchemaVersion(database);
}

export function getLocalSchemaVersion(database: Database.Database): number {
  const hasMeta = database
    .prepare<[], { count: number }>(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'",
    )
    .get();
  if (!hasMeta || hasMeta.count === 0) return 0;
  return (
    database
      .prepare<[], VersionRow>(
        "SELECT schema_version FROM app_meta WHERE id = 1",
      )
      .get()?.schema_version ?? 0
  );
}
