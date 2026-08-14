"use client";

import { useEffect } from "react";

function applyStoredAppearance() {
  const savedTheme = window.localStorage.getItem("mentionish-theme");
  const theme =
    savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;

  const density =
    window.localStorage.getItem("mentionish-density") === "compact"
      ? "compact"
      : "comfortable";
  document.documentElement.classList.toggle("compact", density === "compact");
  document.documentElement.dataset.density = density;
}

export function AppearanceRuntime() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyStoredAppearance();
    update();
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return null;
}
