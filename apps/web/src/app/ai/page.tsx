"use client";

import React, { useState } from "react";
import { Sparkles, Search, Brain, ShieldAlert } from "lucide-react";

export default function AIIntelligencePage() {
  const [activeTab, setActiveTab] = useState<"assistant" | "vault" | "patterns">("assistant");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">AI Intelligence</h1>
        <p className="text-sm text-text-muted mt-1">
          Assistant chat, Personal Learning Engine patterns, and Knowledge Vault retrieval.
        </p>
      </div>

      <div className="p-4 rounded-card bg-surface2 border border-border flex items-center justify-between text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning" />
          <span>Private by default: External cloud AI is opt-in and currently disabled.</span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-3">
        {(["assistant", "vault", "patterns"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-control text-sm font-medium capitalize transition ${
              activeTab === tab
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text hover:bg-surface2"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "assistant" && (
        <div className="p-6 rounded-card bg-surface border border-border space-y-4">
          <div className="flex items-center gap-2 text-text font-semibold text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>AI Assistant</span>
          </div>
          <div className="p-8 text-center text-xs text-text-muted border border-dashed border-border rounded-control">
            Assistant is grounded in your personal database records. Ask questions about tasks, deadlines, or productivity metrics.
          </div>
        </div>
      )}

      {activeTab === "vault" && (
        <div className="p-6 rounded-card bg-surface border border-border space-y-4">
          <div className="flex items-center gap-2 text-text font-semibold text-base">
            <Search className="w-4 h-4 text-primary" />
            <span>Knowledge Vault (Search)</span>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search notes, documents, and historical task records..."
              className="w-full px-4 py-2.5 rounded-control bg-surface2 border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {activeTab === "patterns" && (
        <div className="p-6 rounded-card bg-surface border border-border space-y-4">
          <div className="flex items-center gap-2 text-text font-semibold text-base">
            <Brain className="w-4 h-4 text-primary" />
            <span>Learned Productivity Patterns</span>
          </div>
          <p className="text-xs text-text-muted">
            Observed habits, completion duration distributions, and personal planning models.
          </p>
        </div>
      )}
    </div>
  );
}

