"use client";

import React, { useState } from "react";
import { CheckSquare, Calendar, Filter, Plus } from "lucide-react";

type Segment = "today" | "upcoming" | "backlog" | "completed";

export default function TasksPage() {
  const [segment, setSegment] = useState<Segment>("today");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Tasks</h1>
          <p className="text-sm text-text-muted mt-1">
            Manage your task pipeline, deadlines, and schedule blocks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-control bg-surface2 border border-border text-sm text-text hover:bg-surface2/80 transition"
          >
            <Calendar className="w-4 h-4 text-text-muted" />
            <span>Calendar View</span>
          </button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-hover transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Segment switcher */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {(["today", "upcoming", "backlog", "completed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSegment(tab)}
            className={`px-3 py-1.5 rounded-control text-sm font-medium capitalize transition ${
              segment === tab
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text hover:bg-surface2"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Task list container */}
      <div className="p-6 rounded-card bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Showing {segment} tasks</span>
          <button className="flex items-center gap-1 hover:text-text">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
        </div>

        <div className="space-y-2.5">
          <div className="p-3.5 rounded-control bg-surface2 border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-text">Implement M0 Web Shell</p>
                <p className="text-xs text-text-muted">Professional · Est: 60m · Deadline: Today</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
              In Progress
            </span>
          </div>

          <div className="p-3.5 rounded-control bg-surface2 border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-4 h-4 text-text-muted" />
              <div>
                <p className="text-sm font-medium text-text">Implement M0 Mobile Shell (Expo SDK 58)</p>
                <p className="text-xs text-text-muted">Professional · Est: 60m · Deadline: Today</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-surface2 border border-border text-text-muted font-medium">
              Next Up
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

