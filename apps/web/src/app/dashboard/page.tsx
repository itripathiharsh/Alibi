"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppMeta } from "@alibi/domain-types";
import { Activity, CheckCircle2, Clock, Target, AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMeta() {
      try {
        setLoading(true);
        const { data, error: apiError } = await api.GET("/api/v1/meta");
        if (apiError || !data) {
          throw new Error("Unable to reach backend API");
        }
        setMeta(data as AppMeta);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load system metadata");
      } finally {
        setLoading(false);
      }
    }
    loadMeta();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">
            Personal performance metrics, today&apos;s schedule, and proposals.
          </p>
        </div>

        {meta && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-control bg-surface2 border border-border text-xs">
            <span className="w-2 h-2 rounded-full bg-success"></span>
            <span className="font-medium text-text">Mode: {meta.mode}</span>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted">{meta.timezone}</span>
          </div>
        )}
      </div>

      {loading && (
        <div className="p-8 text-center text-text-muted bg-surface rounded-card border border-border animate-pulse">
          Connecting to backend and loading dashboard metrics...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-card bg-danger/10 border border-danger/20 text-danger flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Backend Connection Notice</p>
            <p className="text-xs opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-card bg-surface border border-border space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-xs font-medium uppercase tracking-wider">Productivity Score</span>
            <Target className="w-4 h-4 text-primary" />
          </div>
          <div className="text-3xl font-bold text-text tabular-nums">94%</div>
          <p className="text-xs text-text-muted">Formula: 0.5·comp + 0.3·on-time + 0.2·est</p>
        </div>

        <div className="p-5 rounded-card bg-surface border border-border space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-xs font-medium uppercase tracking-wider">Completion Rate</span>
            <CheckCircle2 className="w-4 h-4 text-success" />
          </div>
          <div className="text-3xl font-bold text-text tabular-nums">96%</div>
          <p className="text-xs text-text-muted">24 of 25 tasks completed</p>
        </div>

        <div className="p-5 rounded-card bg-surface border border-border space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-xs font-medium uppercase tracking-wider">On-Time Rate</span>
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <div className="text-3xl font-bold text-text tabular-nums">92%</div>
          <p className="text-xs text-text-muted">Delivered within scheduled deadline</p>
        </div>

        <div className="p-5 rounded-card bg-surface border border-border space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-xs font-medium uppercase tracking-wider">Estimate Accuracy</span>
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div className="text-3xl font-bold text-text tabular-nums">89%</div>
          <p className="text-xs text-text-muted">Actual duration vs estimated</p>
        </div>
      </div>

      {/* Today's Schedule & Proposals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-card bg-surface border border-border">
          <h2 className="font-semibold text-base text-text mb-4">Today&apos;s Focus Blocks</h2>
          <div className="space-y-3">
            <div className="p-3.5 rounded-control bg-surface2 border border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text">Milestone M0 Environment Verification</p>
                <p className="text-xs text-text-muted mt-0.5">09:00 - 11:30 · Professional</p>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-success/10 text-success">
                Complete
              </span>
            </div>

            <div className="p-3.5 rounded-control bg-surface2 border border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text">Architecture Slices & Monorepo Setup</p>
                <p className="text-xs text-text-muted mt-0.5">14:00 - 17:00 · Professional</p>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                In Progress
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-card bg-surface border border-border">
          <h2 className="font-semibold text-base text-text mb-4">Pending Proposals</h2>
          <p className="text-xs text-text-muted mb-4">
            AI schedule and task proposals requiring explicit owner confirmation.
          </p>
          <div className="p-4 rounded-control bg-surface2 border border-dashed border-border text-center text-xs text-text-muted">
            No pending schedule proposals today.
          </div>
        </div>
      </div>
    </div>
  );
}

