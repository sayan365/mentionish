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
    try {
      const integrity = verification
        .prepare<[], { integrity_check: string }>("PRAGMA integrity_check")
        .get()?.integrity_check;
      if (integrity !== "ok") {
        throw new Error(
          "The local backup failed SQLite integrity verification.",
        );
      }
      return {
        path: destination,
        bytes: statSync(destination).size,
        schemaVersion: getLocalSchemaVersion(verification),
      };
    } finally {
      verification.close();
    }
  } catch (error) {
    if (existsSync(destination)) unlinkSync(destination);
    throw error;
  }
}
