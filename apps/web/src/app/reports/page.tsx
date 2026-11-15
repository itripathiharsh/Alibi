"use client";

import React from "react";
import { FileText, Download, Share2, ShieldCheck } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Reports & Sharing</h1>
          <p className="text-sm text-text-muted mt-1">
            Generate verifiable productivity and progress reports, exports, and shared views.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-hover transition">
            <FileText className="w-4 h-4" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-card bg-surface border border-border space-y-4">
          <h2 className="font-semibold text-base text-text">Weekly Work Intelligence Report</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Consolidates completed tasks, verified focus hours, on-time score, and summary narrative. No personal items included by default.
          </p>

          <div className="flex items-center gap-2 pt-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-surface2 border border-border text-xs text-text hover:bg-surface2/80 transition">
              <Download className="w-3.5 h-3.5 text-text-muted" />
              <span>Download PDF</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-surface2 border border-border text-xs text-text hover:bg-surface2/80 transition">
              <Share2 className="w-3.5 h-3.5 text-text-muted" />
              <span>Create Share Link</span>
            </button>
          </div>
        </div>

        <div className="p-6 rounded-card bg-surface border border-border space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-success" />
            <h2 className="font-semibold text-base text-text">Privacy & Separation Rule</h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Per non-negotiable product constraint #12, personal and academic tasks are never included in professional shares unless explicitly reviewed and unlocked by you.
          </p>
        </div>
      </div>
    </div>
  );
}

