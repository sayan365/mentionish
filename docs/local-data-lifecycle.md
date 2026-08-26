# Local data lifecycle

Mentionish keeps its workspace and credentials on the current device. Settings -> Local data is the canonical place to find the active database and backup directory.

## What a backup contains

**Create and download backup** uses SQLite's online backup API, verifies the copied database with `PRAGMA integrity_check`, stores a timestamped copy in the local backups directory, and downloads the same file through the browser.

The database can contain:

- product descriptions, audiences, phrases, and reply guidance;
- retrieved public posts/comments, public usernames, and source metadata;
- scan history, classifications, feedback, drafts, and self-reported reply state;
- non-secret provider and connector settings.

The backup does not contain AI API keys, Reddit/browser cookies, the Mentionish installation token, or OpenCLI browser profiles. Configure those again after moving to a different computer.

## Restore a backup

Restore is intentionally offline. Replacing the database while Mentionish holds it open can corrupt or mix SQLite WAL state.

1. In Settings -> Local data, create a current backup and open the data folder.
2. Stop Mentionish with `Ctrl+C` in the terminal that is running it.
3. Create a recovery subfolder in the data directory.
4. Move the current `mentionish.sqlite3` and any `mentionish.sqlite3-wal` or `mentionish.sqlite3-shm` files into that recovery folder. Do not delete them yet.
5. Copy the chosen Mentionish `.sqlite3` backup into the data directory and name the copy `mentionish.sqlite3`.
6. Run `npm start`.

Mentionish refuses migration history that does not match the application and refuses a database schema newer than the installed application. Keep the recovery folder until the restored workspace has been inspected.

## Reset the workspace

**Reset local workspace** clears products, retrieved source items, conversations, scans, drafts, feedback, non-secret settings, and saved AI provider keys. It preserves the installed application, schema/migrations, and installation identity.

The reset:

1. refuses to run while a scan is active;
2. requires the exact typed confirmation `RESET`;
3. creates and integrity-checks a timestamped safety backup;
4. clears the workspace in a database transaction;
5. reports the safety-backup filename.

The backup is not deleted automatically. Use it through the offline restore procedure if the reset was a mistake.

## Move to another computer

1. Create and download a backup on the old computer.
2. Clone and start the same or a newer Mentionish version on the new computer once, then stop it.
3. Follow the offline restore steps using the new computer's data directory.
4. Add the AI provider key again and configure/test the local OpenCLI Reddit profile again.

## Uninstall

1. Create a final backup if any workspace data may be needed later.
2. Stop Mentionish with `Ctrl+C`.
3. Remove the cloned Mentionish project directory.
4. To remove all Mentionish-owned workspace data and encrypted provider credentials, remove the exact data directory shown in Settings -> Local data.
5. OpenCLI is an independent upstream tool. Remove its package, extension, or browser profiles separately only if they are no longer used by anything else.
6. Browser-only theme/density preferences can be removed by clearing site data for the local dashboard origin.

Deleting the data directory is irreversible unless a backup exists. Never remove a parent application-data directory.
