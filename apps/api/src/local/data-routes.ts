import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { Router, type Response } from "express";
import { z } from "zod";
import type {
  LocalBackupResult,
  LocalWorkspaceResetResult,
} from "@mentionish/database";

export interface LocalDataService {
  dataDirectory: string;
  databasePath: string;
  backupsDirectory: string;
  schemaVersion: () => number;
  createBackup: () => Promise<LocalBackupResult>;
  reset: () => Promise<{
    backup: LocalBackupResult;
    cleared: LocalWorkspaceResetResult;
  }>;
  openDataDirectory?: () => Promise<void> | void;
}

const resetSchema = z.object({ confirmation: z.literal("RESET") });

function fail(
  response: Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({
    error: {
      code,
      message,
      request_id: String(response.getHeader("x-request-id") ?? "unknown"),
      details: {},
    },
  });
}

export function openLocalDataDirectory(directory: string): Promise<void> {
  const command =
    process.platform === "win32"
      ? { executable: "explorer.exe", arguments: [directory] }
      : process.platform === "darwin"
        ? { executable: "open", arguments: [directory] }
        : { executable: "xdg-open", arguments: [directory] };
  const child = spawn(command.executable, command.arguments, {
    detached: true,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}

export function createLocalDataRouter(service: LocalDataService): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.setHeader("cache-control", "no-store");
    response.json({
      data: {
        database_path: service.databasePath,
        backups_directory: service.backupsDirectory,
        schema_version: service.schemaVersion(),
      },
    });
  });

  router.post("/backups", async (_request, response) => {
    try {
      const backup = await service.createBackup();
      response.setHeader("cache-control", "no-store");
      response.setHeader("x-mentionish-schema-version", backup.schemaVersion);
      response.setHeader(
        "x-mentionish-backup-warning",
        "May contain product descriptions, public usernames and text, and drafts",
      );
      response.setHeader("content-type", "application/vnd.sqlite3");
      response.setHeader(
        "content-disposition",
        `attachment; filename="${basename(backup.path)}"`,
      );
      response.setHeader("content-length", backup.bytes);
      const stream = createReadStream(backup.path);
      stream.once("error", () => {
        if (!response.headersSent) {
          fail(
            response,
            500,
            "BACKUP_DOWNLOAD_FAILED",
            "The backup was created, but the browser download could not start. Open the backups folder to retrieve it.",
          );
        } else {
          response.destroy();
        }
      });
      stream.pipe(response);
    } catch {
      fail(
        response,
        500,
        "BACKUP_FAILED",
        "Mentionish could not create an integrity-checked backup.",
      );
    }
  });

  router.post("/open-folder", async (_request, response) => {
    try {
      await (
        service.openDataDirectory ??
        (() => openLocalDataDirectory(service.dataDirectory))
      )();
      response.status(204).end();
    } catch {
      fail(
        response,
        500,
        "OPEN_DATA_FOLDER_FAILED",
        "Mentionish could not open the data folder. Copy the path shown in Settings instead.",
      );
    }
  });

  router.post("/reset", async (request, response) => {
    const parsed = resetSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      fail(
        response,
        400,
        "RESET_CONFIRMATION_REQUIRED",
        "Type RESET to confirm that you want to clear this workspace.",
      );
      return;
    }
    try {
      const result = await service.reset();
      response.setHeader("cache-control", "no-store");
      response.json({
        data: {
          backup_filename: basename(result.backup.path),
          backup_schema_version: result.backup.schemaVersion,
          cleared: result.cleared,
        },
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The reset could not finish.";
      fail(
        response,
        message.includes("scan is still running") ? 409 : 500,
        message.includes("scan is still running")
          ? "SCAN_RUNNING"
          : "RESET_FAILED",
        message,
      );
    }
  });

  return router;
}
