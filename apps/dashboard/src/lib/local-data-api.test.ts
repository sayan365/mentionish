import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadLocalBackup,
  getLocalDataStatus,
  resetLocalWorkspace,
} from "./local-data-api";

afterEach(() => vi.unstubAllGlobals());

describe("local data API client", () => {
  it("loads non-secret storage paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                database_path: "C:\\Mentionish\\mentionish.sqlite3",
                backups_directory: "C:\\Mentionish\\backups",
                schema_version: 14,
              },
            }),
          ),
        ),
      ),
    );

    await expect(getLocalDataStatus("token")).resolves.toMatchObject({
      schema_version: 14,
    });
  });

  it("keeps the server backup filename for browser download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(new Blob(["SQLite format 3"]), {
            headers: {
              "content-disposition":
                'attachment; filename="mentionish-tested.sqlite3"',
            },
          }),
        ),
      ),
    );

    const result = await downloadLocalBackup("token");
    expect(result.filename).toBe("mentionish-tested.sqlite3");
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("sends the exact typed reset confirmation", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              backup_filename: "mentionish-before-reset.sqlite3",
              backup_schema_version: 14,
              cleared: {
                products: 1,
                conversations: 4,
                sourceItems: 20,
                scans: 2,
                drafts: 1,
              },
            },
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resetLocalWorkspace("token", "RESET")).resolves.toMatchObject({
      cleared: { products: 1 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/local/data/reset",
      expect.objectContaining({
        body: JSON.stringify({ confirmation: "RESET" }),
      }),
    );
  });
});
