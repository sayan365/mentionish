"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  downloadLocalBackup,
  getLocalDataStatus,
  openLocalDataFolder,
  resetLocalWorkspace,
  type LocalDataStatus,
} from "../lib/local-data-api";

function messageFor(caught: unknown): string {
  return caught instanceof Error
    ? caught.message
    : "The local data action could not be completed.";
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function LocalDataSettingsPanel({
  accessToken,
}: {
  accessToken: string | null;
}) {
  const [status, setStatus] = useState<LocalDataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"backup" | "folder" | "reset" | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    getLocalDataStatus(accessToken)
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFor(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!resetOpen) return;
    const app = document.querySelector<HTMLElement>(".app-frame");
    const previousOverflow = document.body.style.overflow;
    app?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => {
      app?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, [resetOpen]);

  async function createBackup() {
    if (!accessToken || pending) return;
    setPending("backup");
    setError(null);
    setNotice(null);
    try {
      const backup = await downloadLocalBackup(accessToken);
      const url = URL.createObjectURL(backup.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backup.filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(
        `${backup.filename} was integrity-checked, saved in the backups folder, and sent to your browser.`,
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function openFolder() {
    if (!accessToken || pending) return;
    setPending("folder");
    setError(null);
    try {
      await openLocalDataFolder(accessToken);
      setNotice("The Mentionish data folder was opened on this device.");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  function closeReset() {
    if (pending === "reset") return;
    setResetOpen(false);
    setConfirmation("");
    setError(null);
    window.setTimeout(() => resetTriggerRef.current?.focus(), 0);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeReset();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = focusableElements(dialogRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function confirmReset() {
    if (!accessToken || pending || confirmation !== "RESET") return;
    setPending("reset");
    setError(null);
    try {
      const result = await resetLocalWorkspace(accessToken, confirmation);
      setResetOpen(false);
      setConfirmation("");
      setNotice(
        `Workspace cleared. ${result.backup_filename} was created first so the previous data can be recovered.`,
      );
      window.setTimeout(() => resetTriggerRef.current?.focus(), 0);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  const dialog = resetOpen ? (
    <div className="confirmation-backdrop data-reset-backdrop">
      <section
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="data-reset-title"
        aria-describedby="data-reset-description"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="confirmation-copy">
          <span
            className="confirmation-mark confirmation-mark-danger"
            aria-hidden="true"
          >
            !
          </span>
          <div>
            <h2 id="data-reset-title">Reset this local workspace?</h2>
            <p id="data-reset-description">
              Products, source items, conversations, scans, drafts, feedback,
              provider settings, and saved AI keys will be cleared. Mentionish
              creates an integrity-checked safety backup first.
            </p>
          </div>
        </div>
        <label htmlFor="reset-confirmation">
          Type <strong>RESET</strong> to continue
        </label>
        <input
          id="reset-confirmation"
          value={confirmation}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={confirmation.length > 0 && confirmation !== "RESET"}
          onChange={(event) => {
            setConfirmation(event.target.value);
            setError(null);
          }}
        />
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="confirmation-actions">
          <button
            ref={cancelRef}
            className="secondary-action"
            type="button"
            disabled={pending === "reset"}
            onClick={closeReset}
          >
            Cancel
          </button>
          <button
            className="danger-action"
            type="button"
            disabled={confirmation !== "RESET" || pending === "reset"}
            aria-busy={pending === "reset"}
            onClick={() => void confirmReset()}
          >
            {pending === "reset"
              ? "Creating backup and resetting…"
              : "Reset workspace"}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className="settings-stack local-data-settings">
      <section className="settings-section settings-info-page">
        <p className="page-kicker">Private by default</p>
        <h2>Your workspace stays on this device</h2>
        <p>
          Products, conversations, drafts, scan history, and non-secret provider
          settings live in Mentionish&apos;s local SQLite database. Nothing is
          synced to a Mentionish cloud account.
        </p>
        {loading ? (
          <div className="local-data-loading" aria-busy="true">
            Reading local storage details…
          </div>
        ) : status ? (
          <dl className="local-data-paths">
            <div>
              <dt>Database</dt>
              <dd>
                <code>{status.database_path}</code>
              </dd>
            </div>
            <div>
              <dt>Backups</dt>
              <dd>
                <code>{status.backups_directory}</code>
              </dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>Version {status.schema_version}</dd>
            </div>
          </dl>
        ) : null}
        <div className="local-data-actions">
          <button
            className="primary-action"
            type="button"
            disabled={!accessToken || Boolean(pending)}
            aria-busy={pending === "backup"}
            onClick={() => void createBackup()}
          >
            {pending === "backup"
              ? "Creating backup…"
              : "Create and download backup"}
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={!accessToken || Boolean(pending)}
            aria-busy={pending === "folder"}
            onClick={() => void openFolder()}
          >
            {pending === "folder" ? "Opening folder…" : "Open data folder"}
          </button>
        </div>
        <p className="settings-caution">
          Database backups may contain product descriptions, public usernames
          and source text, and your drafts. Saved AI keys and browser cookies
          are not included.
        </p>
      </section>

      <section className="settings-section local-data-recovery">
        <div>
          <p className="page-kicker">Recovery</p>
          <h2>Restore a backup offline</h2>
          <p>
            Stop Mentionish before replacing its database. This prevents an open
            SQLite connection from corrupting the restored file.
          </p>
        </div>
        <ol>
          <li>
            Create a current backup, then stop the app with <code>Ctrl+C</code>.
          </li>
          <li>
            Open the data folder and rename <code>mentionish.sqlite3</code> so
            it remains recoverable.
          </li>
          <li>
            Copy the chosen <code>.sqlite3</code> backup into that folder as{" "}
            <code>mentionish.sqlite3</code>, then run <code>npm start</code>.
          </li>
        </ol>
        <p className="local-data-note">
          On another computer, configure AI keys and the supervised Reddit
          profile again; those credentials are intentionally not portable.
        </p>
      </section>

      <section className="settings-section local-data-danger">
        <div>
          <p className="page-kicker">Danger zone</p>
          <h2>Reset workspace</h2>
          <p>
            Return Mentionish to an empty workspace while keeping the app and
            database schema installed. A safety backup is created automatically.
          </p>
        </div>
        <button
          ref={resetTriggerRef}
          className="danger-action danger-action-outline"
          type="button"
          disabled={!accessToken || Boolean(pending)}
          onClick={() => {
            setNotice(null);
            setError(null);
            setResetOpen(true);
          }}
        >
          Reset local workspace…
        </button>
      </section>

      {notice ? (
        <p className="settings-action-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!resetOpen && error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {typeof document !== "undefined" && dialog
        ? createPortal(dialog, document.body)
        : null}
    </div>
  );
}
