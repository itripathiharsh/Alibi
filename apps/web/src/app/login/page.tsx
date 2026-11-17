"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthPageLayout } from "@/components/auth-page-layout";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, needsSetup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || undefined;
      await login(email, password, returnTo);
    } catch (err: unknown) {
      setError((err as Error).message || "Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageLayout
      mode="login"
      eyebrow="Welcome back"
      title="Good to see you again."
      description="Sign in to your ALIBI workspace and continue with a clearer plan."
      notice={needsSetup ? <div className="auth-notice"><span>ALIBI needs its initial setup.</span><Link href="/setup">Set up now</Link></div> : undefined}
      footer={<>New to ALIBI? <Link href="/signup">Create your account</Link></>}
    >
      {error && <div role="alert" className="auth-error">{error}</div>}
      <form onSubmit={handleSubmit} className="auth-form-fields">
        <label className="auth-field">Email address
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <label className="auth-field">Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />
        </label>
        <button type="submit" disabled={isSubmitting} className="auth-submit">{isSubmitting ? "Signing in…" : <>Sign in <ArrowRight size={17} /></>}</button>
      </form>
    </AuthPageLayout>
  );
}
