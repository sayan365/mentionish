import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppearanceRuntime } from "../components/appearance-runtime";
import "./styles.css";

export const metadata: Metadata = {
  title: "Mentionish",
  description: "Find the right conversations. Earn the right to reply.",
};

const appearanceScript = `
(() => {
  try {
    const savedTheme = localStorage.getItem("mentionish-theme");
    const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = theme;

    const density = localStorage.getItem("mentionish-density") === "compact" ? "compact" : "comfortable";
    document.documentElement.classList.toggle("compact", density === "compact");
    document.documentElement.dataset.density = density;
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body>
        <AppearanceRuntime />
        {children}
      </body>
    </html>
  );
}
