"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AiSettingsPanel } from "./ai-settings";
import { AppIcon } from "./app-icon";
import { RedditSettingsPanel } from "./reddit-settings";

type SettingsTab = "sources" | "ai" | "data" | "appearance";
type ThemeChoice = "system" | "light" | "dark";
type DensityChoice = "comfortable" | "compact";

function applyTheme(choice: ThemeChoice) {
  const useDark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", useDark);
  document.documentElement.dataset.theme = choice;
}

export function WorkspaceSettings({
  accessToken,
}: {
  accessToken: string | null;
}) {
  const pathname = usePathname();
  const routeSection = pathname.split("/").filter(Boolean)[2];
  const tab: SettingsTab =
    routeSection === "ai" ||
    routeSection === "data" ||
    routeSection === "appearance"
      ? routeSection
      : "sources";
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [density, setDensity] = useState<DensityChoice>("comfortable");

  useEffect(() => {
    const saved = window.localStorage.getItem("mentionish-theme");
    const choice: ThemeChoice =
      saved === "light" || saved === "dark" ? saved : "system";
    setTheme(choice);
    applyTheme(choice);
    const savedDensity = window.localStorage.getItem("mentionish-density");
    const densityChoice: DensityChoice =
      savedDensity === "compact" ? "compact" : "comfortable";
    setDensity(densityChoice);
    document.documentElement.classList.toggle(
      "compact",
      densityChoice === "compact",
    );
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(theme);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  function chooseTheme(choice: ThemeChoice) {
    setTheme(choice);
    window.localStorage.setItem("mentionish-theme", choice);
    applyTheme(choice);
  }

  function chooseDensity(choice: DensityChoice) {
    setDensity(choice);
    window.localStorage.setItem("mentionish-density", choice);
    document.documentElement.classList.toggle("compact", choice === "compact");
    document.documentElement.dataset.density = choice;
  }

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "sources", label: "Sources" },
    { id: "ai", label: "AI models" },
    { id: "data", label: "Local data" },
    { id: "appearance", label: "Appearance" },
  ];

  return (
    <section
      className="settings-workspace"
      aria-labelledby="settings-area-title"
    >
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map((item) => (
          <Link
            className={
              tab === item.id
                ? "settings-tab settings-tab-active"
                : "settings-tab"
            }
            aria-current={tab === item.id ? "page" : undefined}
            key={item.id}
            href={`/dashboard/settings/${item.id}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="settings-content">
        <h2 id="settings-area-title" className="sr-only">
          {tabs.find((item) => item.id === tab)?.label} settings
        </h2>
        {tab === "sources" ? (
          <div className="settings-stack">
            <section className="settings-section source-ready-card source-summary-card">
              <div className="settings-heading">
                <div>
                  <p className="page-kicker">Built-in source</p>
                  <h2>Hacker News</h2>
                  <p>Public search is ready with no account or API key.</p>
                </div>
                <span className="source-status source-status-ready">
                  <span aria-hidden="true" /> Ready
                </span>
              </div>
            </section>
            <RedditSettingsPanel accessToken={accessToken} />
          </div>
        ) : null}
        {tab === "ai" ? <AiSettingsPanel accessToken={accessToken} /> : null}
        {tab === "data" ? (
          <section className="settings-section settings-info-page">
            <p className="page-kicker">Private by default</p>
            <h2>Your workspace stays on this device</h2>
            <p>
              Products, conversations, drafts, scan history, and provider
              settings are stored in Mentionish's local application data.
              Nothing is synced to a Mentionish cloud account.
            </p>
            <div className="settings-info-grid">
              <article>
                <AppIcon name="products" />
                <div>
                  <strong>Local database</strong>
                  <span>
                    Created and migrated automatically when Mentionish starts.
                  </span>
                </div>
              </article>
              <article>
                <AppIcon name="settings" />
                <div>
                  <strong>Bring your own providers</strong>
                  <span>
                    AI and source credentials remain part of this installation.
                  </span>
                </div>
              </article>
            </div>
            <p className="settings-caution">
              Back up your Mentionish application-data directory before
              reinstalling your operating system or moving to another computer.
            </p>
          </section>
        ) : null}
        {tab === "appearance" ? (
          <section className="settings-section settings-info-page">
            <p className="page-kicker">Interface</p>
            <h2>Appearance</h2>
            <p>Choose how Mentionish looks on this browser.</p>
            <div
              className="theme-options"
              role="radiogroup"
              aria-label="Color theme"
            >
              {(["system", "light", "dark"] as const).map((choice) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === choice}
                  className={
                    theme === choice
                      ? "theme-option theme-option-active"
                      : "theme-option"
                  }
                  key={choice}
                  onClick={() => chooseTheme(choice)}
                >
                  <span className={`theme-preview theme-preview-${choice}`} />
                  <strong>
                    {choice.charAt(0).toUpperCase() + choice.slice(1)}
                  </strong>
                  <small>
                    {choice === "system"
                      ? "Follow this device"
                      : choice === "light"
                        ? "Bright workspace"
                        : "Low-light workspace"}
                  </small>
                </button>
              ))}
            </div>
            <div className="density-setting">
              <div>
                <strong>Content density</strong>
                <span>
                  Compact mode fits more products and conversations on screen.
                </span>
              </div>
              <div role="radiogroup" aria-label="Content density">
                {(["comfortable", "compact"] as const).map((choice) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={density === choice}
                    className={
                      density === choice
                        ? "density-option density-option-active"
                        : "density-option"
                    }
                    key={choice}
                    onClick={() => chooseDensity(choice)}
                  >
                    {choice.charAt(0).toUpperCase() + choice.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
