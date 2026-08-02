"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) router.replace("/");
      else setEmail(data.user.email ?? "your account");
    });
  }, [router]);

  if (!email)
    return (
      <main className="centered">
        <p>Loading your workspace…</p>
      </main>
    );

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <main className="centered">
      <section className="card">
        <p className="eyebrow">Signed in as {email}</p>
        <h1>Your Mentionish workspace is ready.</h1>
        <p>Product onboarding arrives next in the roadmap.</p>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>
    </main>
  );
}
