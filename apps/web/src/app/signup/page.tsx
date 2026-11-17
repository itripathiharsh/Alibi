"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthPageLayout } from "@/components/auth-page-layout";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
  const { signup } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || undefined;
      await signup(email, password, displayName || undefined, returnTo);
    } catch (err: unknown) {
      setError((err as Error).message || "Could not create your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageLayout
      mode="signup"
      eyebrow="Start with your own space"
      title="A calmer way to get things done."
      description="Create an account for your ALIBI web team workspace. Personal productivity features live in the Android app."
      footer={<>Already have an account? <Link href="/login">Sign in</Link></>}
    >
      {error && <div role="alert" className="auth-error">{error}</div>}
      <form onSubmit={handleSubmit} className="auth-form-fields">
        <label className="auth-field">Your name <span className="font-normal text-slate-400">(optional)</span>
          <input type="text" maxLength={100} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we address you?" />
        </label>
        <label className="auth-field">Email address
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <label className="auth-field">Password
          <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" />
        </label>
        <label className="auth-field">Confirm password
          <input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" />
        </label>
        <button type="submit" disabled={isSubmitting} className="auth-submit">{isSubmitting ? "Creating account…" : <>Create account <ArrowRight size={17} /></>}</button>
      </form>
    </AuthPageLayout>
  );
}
