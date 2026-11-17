"use client";

import React, { useState } from "react";
import Link from "next/link";
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
      await signup(email, password, displayName || undefined);
    } catch (err: unknown) {
      setError((err as Error).message || "Could not create your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <section className="max-w-md w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm">
        <header className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#102E42] text-white font-bold text-xl mb-3">A</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create your ALIBI account</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Your workspace and records are private to your account.</p>
        </header>

        {error && <div role="alert" className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name <span className="font-normal text-gray-500">(optional)</span>
            <input type="text" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="mt-1 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email address
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
            <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" className="mt-1 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Confirm password
            <input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </label>
          <button type="submit" disabled={isSubmitting} className="w-full py-3 px-4 bg-[#102E42] hover:bg-[#163c53] text-white font-semibold rounded-xl transition disabled:opacity-50">
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account? <Link href="/login" className="font-semibold text-orange-600 hover:underline">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
