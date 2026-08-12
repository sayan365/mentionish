"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../lib/supabase";
import { isLocalRuntime } from "../lib/runtime";

export default function HomePage() {
  const router = useRouter();
  const localRuntime = isLocalRuntime();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"google" | "email" | null>(null);

  useEffect(() => {
    if (localRuntime) router.replace("/dashboard");
  }, [localRuntime, router]);

  if (localRuntime) {
    return (
      <main className="app-loading" aria-busy="true">
        <span className="loading-mark">M</span>
        <p>Opening your local workspace...</p>
      </main>
    );
  }

  async function signInWithGoogle() {
    setPending("google");
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(null);
      setMessage(error.message);
    }
  }

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("email");
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setPending(null);
    setMessage(
      error ? error.message : "Check your inbox for your secure sign-in link.",
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">
          Community intelligence for thoughtful founders
        </p>
        <h1>Find the right conversations. Earn the right to reply.</h1>
        <p className="lede">
          Mentionish surfaces relevant Reddit and Hacker News discussions and
          helps you prepare useful, community-safe responses. You always review
          and post them yourself.
        </p>
      </section>
      <section className="card" aria-labelledby="signin-title">
        <h2 id="signin-title">Start your 14-day trial</h2>
        <p>No password and no card required.</p>
        <button
          className="oauth-button"
          type="button"
          disabled={pending !== null}
          onClick={() => void signInWithGoogle()}
        >
          {pending === "google" ? "Connecting..." : "Continue with Google"}
        </button>
        <div className="divider" aria-hidden="true">
          <span>or</span>
        </div>
        <form onSubmit={(event) => void signInWithEmail(event)}>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
          <button type="submit" disabled={pending !== null}>
            {pending === "email" ? "Sending..." : "Email me a sign-in link"}
          </button>
        </form>
        {message ? (
          <p role="status" className="status">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
