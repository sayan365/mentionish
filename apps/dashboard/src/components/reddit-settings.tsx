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
  return (
    <section
      className="settings-shell reddit-settings"
      aria-labelledby="reddit-settings-title"
    >
      <div className="settings-heading">
        <div>
          <p className="page-kicker">Experimental source</p>
          <h2 id="reddit-settings-title">Reddit account</h2>
          <p>
            Pin scans to one OpenCLI browser profile. Mentionish never receives
            the profile password or cookies.
          </p>
        </div>
        <span
          className={`source-pill ${account && !config?.kill_switch ? "" : "source-warning"}`}
        >
          {config?.kill_switch
            ? "Paused"
            : account
              ? "Read verified"
              : "Setup needed"}
        </span>
      </div>
      <div className="settings-field">
        <label htmlFor="reddit-profile">OpenCLI profile alias</label>
        <input
          id="reddit-profile"
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
          placeholder="dedicated-reddit"
          maxLength={50}
        />
        <small>
          Run <code>opencli profile list</code>, then{" "}
          <code>opencli profile rename CONTEXT_ID dedicated-reddit</code>. Leave
          blank only to use OpenCLI’s default profile.
        </small>
      </div>
      {account ? (
        <div className="account-verification">
          <strong>{account.username ?? "Verified account"}</strong>
          <span>
            {account.totalKarma ?? "Unknown"} karma · created{" "}
            {account.accountCreated ?? "unknown"}
          </span>
          <p>
            Low age or karma is a caution signal, not a safe/unsafe guarantee.
            Posting remains manual-only.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="inline-card-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="primary-action"
        type="button"
        disabled={!config?.enabled || working}
        onClick={() => void verify()}
      >
        {working
          ? "Testing read..."
          : config?.kill_switch
            ? "Test and clear pause"
            : "Test read and save profile"}
      </button>
    </section>
  );
}
