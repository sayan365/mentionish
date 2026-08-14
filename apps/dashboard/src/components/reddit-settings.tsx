"use client";

import { useEffect, useState } from "react";
import {
  getRedditConfiguration,
  testRedditProfile,
  type RedditConfiguration,
} from "../lib/reddit-api";

export function RedditSettingsPanel({
  accessToken,
}: {
  accessToken: string | null;
}) {
  const [config, setConfig] = useState<RedditConfiguration | null>(null);
  const [profile, setProfile] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void getRedditConfiguration(accessToken)
      .then((value) => {
        setConfig(value);
        setProfile(value.profile ?? "");
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load Reddit settings.",
        ),
      );
  }, [accessToken]);

  async function verify() {
    if (!accessToken) return;
    setWorking(true);
    setError(null);
    try {
      await testRedditProfile(accessToken, profile.trim() || null);
      const value = await getRedditConfiguration(accessToken);
      setConfig(value);
      setProfile(value.profile ?? "");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Reddit read test failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  const account = config?.verified_account;
  const accountCreated = account?.accountCreated
    ? new Date(account.accountCreated)
    : null;
  const ageDays =
    accountCreated && Number.isFinite(accountCreated.getTime())
      ? Math.max(
          0,
          Math.floor((Date.now() - accountCreated.getTime()) / 86_400_000),
        )
      : null;
  const lowSignal =
    account != null &&
    ((account.totalKarma ?? 0) < 10 || (ageDays != null && ageDays < 30));

  return (
    <section
      className="settings-shell reddit-settings"
      aria-labelledby="reddit-settings-title"
    >
      <div className="settings-heading">
        <div>
          <p className="page-kicker">Experimental source</p>
          <h2 id="reddit-settings-title">Reddit</h2>
          <p>
            Use one supervised OpenCLI browser profile for read-only discovery.
          </p>
        </div>
        <span
          className={`source-status ${
            config?.kill_switch
              ? "source-status-paused"
              : account
                ? "source-status-ready"
                : "source-status-setup"
          }`}
        >
          <span aria-hidden="true" />
          {config?.kill_switch
            ? "Paused"
            : account
              ? "Verified"
              : "Setup needed"}
        </span>
      </div>

      <section
        className="reddit-setting-section"
        aria-labelledby="browser-profile-title"
      >
        <div className="setting-section-heading">
          <div>
            <h3 id="browser-profile-title">Browser profile</h3>
            <p>
              Choose the OpenCLI profile signed in to the dedicated Reddit
              account.
            </p>
          </div>
        </div>
        <div className="settings-field reddit-profile-field">
          <label htmlFor="reddit-profile">Profile alias</label>
          <input
            id="reddit-profile"
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
            placeholder="dedicated-reddit"
            maxLength={50}
          />
          <details className="settings-help">
            <summary>How to find or rename the profile alias</summary>
            <p>
              Run <code>opencli profile list</code>, then{" "}
              <code>opencli profile rename CONTEXT_ID dedicated-reddit</code>.
              Leave this blank only to use OpenCLI&apos;s default profile.
            </p>
          </details>
        </div>
      </section>

      {account ? (
        <section
          className="reddit-setting-section"
          aria-labelledby="account-health-title"
        >
          <div className="setting-section-heading">
            <div>
              <h3 id="account-health-title">Verified account</h3>
              <p>Read access was successfully tested with this profile.</p>
            </div>
            <span
              className={`account-signal ${
                lowSignal ? "account-signal-caution" : "account-signal-normal"
              }`}
            >
              {lowSignal ? "New account" : "Established"}
            </span>
          </div>
          <div className="reddit-account-grid">
            <span>
              <small>Account</small>
              <strong>{account.username ?? "Verified"}</strong>
            </span>
            <span>
              <small>Karma</small>
              <strong>{account.totalKarma ?? "Unknown"}</strong>
            </span>
            <span>
              <small>Account age</small>
              <strong>{ageDays == null ? "Unknown" : `${ageDays} days`}</strong>
            </span>
            <span>
              <small>Verified</small>
              <strong>
                {account.verifiedAt
                  ? new Date(account.verifiedAt).toLocaleDateString()
                  : "Current session"}
              </strong>
            </span>
          </div>
          <p className="account-safety-note">
            Account age and karma are caution signals, not safety guarantees.
            Replies remain manual-only.
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="inline-card-error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="reddit-settings-footer">
        <span>The alias is saved only after a successful read test.</span>
        <button
          className="primary-action"
          type="button"
          disabled={!config?.enabled || working}
          onClick={() => void verify()}
        >
          {working
            ? "Testing read..."
            : config?.kill_switch
              ? "Test and resume"
              : "Verify and save"}
        </button>
      </footer>
    </section>
  );
}
