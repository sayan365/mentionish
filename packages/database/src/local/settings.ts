import type Database from "better-sqlite3";

interface SettingRow {
  non_secret_value_json: string;
}

export class LocalSettingsRepository {
  constructor(private readonly database: Database.Database) {}

  get<T>(key: string): T | null {
    const row = this.database
      .prepare<[string], SettingRow>(
        "SELECT non_secret_value_json FROM settings WHERE key = ?",
      )
      .get(key);
    return row ? (JSON.parse(row.non_secret_value_json) as T) : null;
  }

  set(key: string, value: unknown): void {
    this.database
      .prepare<[string, string, string]>(
        `INSERT INTO settings(key, non_secret_value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           non_secret_value_json = excluded.non_secret_value_json,
           updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  delete(key: string): void {
    this.database
      .prepare<[string]>("DELETE FROM settings WHERE key = ?")
      .run(key);
  }
}
