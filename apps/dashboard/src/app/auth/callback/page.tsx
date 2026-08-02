"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("This sign-in link is invalid or has expired.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    void supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) setError(exchangeError.message);
        else router.replace("/dashboard");
      });
  }, [router]);

  return (
    <main className="centered">
      <p role="status">{error ?? "Signing you in…"}</p>
    </main>
  );
}
