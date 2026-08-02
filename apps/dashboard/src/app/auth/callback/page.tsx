"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const supabase = createBrowserSupabaseClient();
    const code = new URLSearchParams(window.location.search).get("code");
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");

    // Remove credentials from the visible URL before making any network request.
    window.history.replaceState(null, "", window.location.pathname);

    async function finishSignIn() {
      if (code) {
        return supabase.auth.exchangeCodeForSession(code);
      }
      if (accessToken && refreshToken) {
        return supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
      return {
        error: new Error("This sign-in link is invalid or has expired."),
      };
    }

    void finishSignIn().then(({ error: signInError }) => {
      if (signInError) setError(signInError.message);
      else router.replace("/dashboard");
    });
  }, [router]);

  return (
    <main className="centered">
      <section className="card">
        <p role="status">{error ?? "Signing you in…"}</p>
        {error ? (
          <button type="button" onClick={() => router.replace("/")}>
            Request a new sign-in link
          </button>
        ) : null}
      </section>
    </main>
  );
}
