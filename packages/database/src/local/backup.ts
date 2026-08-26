import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { getLocalSchemaVersion } from "./migrations.js";

export interface LocalBackupResult {
  path: string;
  bytes: number;
  schemaVersion: number;
}

export interface LocalWorkspaceResetResult {
  products: number;
  conversations: number;
  sourceItems: number;
  scans: number;
  drafts: number;
}

export function assertLocalWorkspaceCanReset(
  database: Database.Database,
): void {
  const activeScans = database
    .prepare<[], { count: number }>(
      "SELECT count(*) AS count FROM scan_runs WHERE status IN ('pending','running','cancelling')",
    )
    .get()?.count;
  if ((activeScans ?? 0) > 0) {
    throw new Error(
      "A discovery scan is still running. Cancel it before resetting local data.",
    );
  }
}

function assertInsideDirectory(directory: string, target: string): void {
  const relativePath = relative(resolve(directory), resolve(target));
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error("The backup target must be inside the backup directory.");
  }
}

export async function createLocalDatabaseBackup(
  database: Database.Database,
  backupsDirectory: string,
  now: Date = new Date(),
): Promise<LocalBackupResult> {
  const directory = resolve(backupsDirectory);
  mkdirSync(directory, { recursive: true });
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const destination = resolve(
    directory,
    `mentionish-${timestamp}-${randomUUID().slice(0, 8)}.sqlite3`,
  );
  assertInsideDirectory(directory, destination);

  try {
    await database.backup(destination);
    const verification = new Database(destination, {
      readonly: true,
      fileMustExist: true,
    });
    let result: LocalBackupResult;
    try {
      const integrity = verification
        .prepare<[], { integrity_check: string }>("PRAGMA integrity_check")
        .get()?.integrity_check;
      if (integrity !== "ok") {
        throw new Error(
          "The local backup failed SQLite integrity verification.",
        );
      }
      result = {
        path: destination,
        bytes: statSync(destination).size,
        schemaVersion: getLocalSchemaVersion(verification),
      };
    } finally {
      verification.close();
    }
    for (const sidecar of [`${destination}-wal`, `${destination}-shm`]) {
      if (existsSync(sidecar)) unlinkSync(sidecar);
    }
    return result;
  } catch (error) {
    if (existsSync(destination)) unlinkSync(destination);
    throw error;
  }
}

export function resetLocalWorkspaceDatabase(
  database: Database.Database,
): LocalWorkspaceResetResult {
  assertLocalWorkspaceCanReset(database);

  const count = (table: string): number =>
    database
      .prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`)
      .get()?.count ?? 0;
  const result: LocalWorkspaceResetResult = {
    products: count("products"),
    conversations: count("opportunities"),
    sourceItems: count("scanned_posts"),
    scans: count("scan_runs"),
    drafts: count("drafts"),
  };

  database.transaction(() => {
    // Root records own their dependent evidence through ON DELETE CASCADE.
    database.prepare("DELETE FROM products").run();
    database.prepare("DELETE FROM scan_runs").run();
    database.prepare("DELETE FROM scanned_posts").run();
    database.prepare("DELETE FROM community_rule_snapshots").run();
    database.prepare("DELETE FROM platform_safety_events").run();
    database.prepare("DELETE FROM settings").run();
  })();

  return result;
}
