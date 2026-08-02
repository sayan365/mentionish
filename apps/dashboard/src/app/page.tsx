"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setPending(false);
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
        <form onSubmit={(event) => void signIn(event)}>
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
          <button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
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
