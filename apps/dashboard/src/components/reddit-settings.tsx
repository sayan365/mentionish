"use client";

import { useEffect, useState } from "react";
import {
  getRedditConfiguration,
  pauseReddit,
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
  const [working, setWorking] = useState<"verify" | "pause" | null>(null);
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
    setWorking("verify");
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
      setWorking(null);
    }
  }

  async function pause() {
    if (!accessToken) return;
    setWorking("pause");
    setError(null);
    try {
      const value = await pauseReddit(accessToken);
      setConfig(value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Reddit could not be paused.",
      );
    } finally {
      setWorking(null);
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
  const safety = config?.safety;
  const safetyLabel = safety
    ? safety.state.charAt(0).toUpperCase() + safety.state.slice(1)
    : "Loading";
  const displayTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString() : "No evidence";

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
          className={`source-status source-status-${safety?.state ?? "setup"}`}
        >
          <span aria-hidden="true" />
          {safetyLabel}
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

      <section
        className={`reddit-setting-section account-safety-center account-safety-${safety?.state ?? "unknown"}`}
        aria-labelledby="account-safety-title"
      >
        <div className="setting-section-heading">
          <div>
            <p className="page-kicker">Evidence, not a safety score</p>
            <h3 id="account-safety-title">Account Safety Center</h3>
            <p>{safety?.reason ?? "Loading current Reddit evidence..."}</p>
          </div>
          <span
            className={`safety-state safety-state-${safety?.state ?? "unknown"}`}
          >
            <span aria-hidden="true" />
            {safetyLabel}
          </span>
        </div>

        <div className="safety-evidence-grid">
          <span>
            <small>Native account check</small>
            <strong>{displayTime(safety?.last_native_account_check_at)}</strong>
          </span>
          <span>
            <small>Latest Reddit read</small>
            <strong>{displayTime(safety?.last_live_read_at)}</strong>
          </span>
          <span>
            <small>Local activity · 24 hours</small>
            <strong>
              {safety
                ? `${safety.recent_scans_24h} scans · ${safety.recent_queries_24h} queries`
                : "Loading"}
            </strong>
          </span>
          <span>
            <small>Cooldown</small>
            <strong>{displayTime(safety?.cooldown_until)}</strong>
          </span>
        </div>

        {account ? (
          <div className="account-identity">
            <div className="setting-section-heading">
              <div>
                <h4>Selected account</h4>
                <p>Public context returned by the bounded account check.</p>
              </div>
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
                <strong>
                  {ageDays == null ? "Unknown" : `${ageDays} days`}
                </strong>
              </span>
              <span>
                <small>Email signal</small>
                <strong>
                  {account.verifiedEmail == null
                    ? "Unknown"
                    : account.verifiedEmail
                      ? "Verified"
                      : "Not verified"}
                </strong>
              </span>
            </div>
          </div>
        ) : null}

        {safety?.events.length ? (
          <details className="safety-history">
            <summary>Recent safety evidence</summary>
            <ol>
              {safety.events.map((event) => (
                <li key={event.id}>
                  <span>{event.category.replaceAll("_", " ")}</span>
                  <p>{event.reason}</p>
                  <time dateTime={event.observed_at}>
                    {new Date(event.observed_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <div className="safety-policy-note">
          <strong>No “safe” state</strong>
          <p>
            Karma, account age, and a successful read do not guarantee access or
            prevent enforcement. Mentionish never rotates accounts or submits
            Reddit actions.
          </p>
          <div>
            <a
              href="https://redditinc.com/policies/user-agreement"
              target="_blank"
              rel="noreferrer"
            >
              Reddit User Agreement
            </a>
            <a
              href="https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam"
              target="_blank"
              rel="noreferrer"
            >
              Reddit spam policy
            </a>
          </div>
        </div>
      </section>

      {account ? (
        <section className="reddit-setting-section account-summary-section">
          <div className="setting-section-heading">
            <div>
              <h3>Reply boundaries</h3>
              <p>
                Discovery is read-only and all Reddit participation stays
                native.
              </p>
            </div>
          </div>
          <p className="account-safety-note">
            Open the native thread, read current community rules, confirm that
            replying is permitted, edit the draft in your own voice, and submit
            manually only if you still choose to participate.
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
        <div>
          {safety?.read_allowed ? (
            <button
              className="secondary-action"
              type="button"
              disabled={working !== null}
              onClick={() => void pause()}
            >
              {working === "pause" ? "Pausing..." : "Pause Reddit"}
            </button>
          ) : null}
          <button
            className="primary-action"
            type="button"
            disabled={!config?.enabled || working !== null}
            onClick={() => void verify()}
          >
            {working === "verify"
              ? "Testing read..."
              : config?.kill_switch
                ? "Test and resume"
                : "Verify and save"}
          </button>
        </div>
      </footer>
    </section>
  );
}
