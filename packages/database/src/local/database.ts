import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import {
  ensureLocalDataDirectories,
  resolveLocalDataPaths,
  type LocalDataPathOptions,
  type LocalDataPaths,
} from "./paths.js";
import { runLocalMigrations } from "./migrations.js";

export interface OpenLocalDatabaseOptions {
  filePath: string;
  installationId?: string;
  migrate?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export interface InitializedLocalDatabase {
  database: Database.Database;
  paths: LocalDataPaths;
}

export function openLocalDatabase(
  options: OpenLocalDatabaseOptions,
): Database.Database {
  const filePath =
    options.filePath === ":memory:" ? ":memory:" : resolve(options.filePath);
  if (filePath !== ":memory:" && !options.readonly) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const database = new Database(filePath, {
    readonly: options.readonly ?? false,
    fileMustExist: options.fileMustExist ?? false,
    timeout: 5_000,
  });

  try {
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    if (!options.readonly) {
      if (!database.memory) database.pragma("journal_mode = WAL");
      database.pragma("synchronous = NORMAL");
      if (options.migrate ?? true) {
        runLocalMigrations(database, options.installationId ?? randomUUID());
      }
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function initializeLocalDatabase(
  options: LocalDataPathOptions = {},
): InitializedLocalDatabase {
  const paths = resolveLocalDataPaths(options);
  ensureLocalDataDirectories(paths);
  return {
    paths,
    database: openLocalDatabase({ filePath: paths.databasePath }),
  };
}
