"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  Clock,
  Calendar,
  Search,
  AlertCircle,
  CheckCircle2,
  Circle,
  Play,
  Pause,
  Sparkles,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";

type Segment = "today" | "upcoming" | "backlog" | "completed";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  raw_input: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: number | null;
  deadline_at: string | null;
  deadline_kind: string | null;
  estimate_user_min: number | null;
  actual_min: number;
  reschedule_count: number;
  tags: string[];
  subtasks: { id: string; title: string; completed: boolean }[];
  completion_note: string | null;
  created_at: string;
}

export default function TasksPage() {
  const { accessToken } = useAuth();
  const [segment, setSegment] = useState<Segment>("today");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Quick capture state
  const [captureInput, setCaptureInput] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);

  // Reschedule modal state
  const [rescheduleTask, setRescheduleTask] = useState<TaskItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  // Complete with note modal state
  const [completeTask, setCompleteTask] = useState<TaskItem | null>(null);
  const [completionNote, setCompletionNote] = useState("");

  const fetchTasks = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/tasks?view=${segment}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      if (!res.ok) {
        throw new Error(`Failed to load tasks (${res.status})`);
      }
      const data = await res.json();
      setTasks(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, segment, search]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Handle Quick Capture
  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureInput.trim() || !accessToken || isCapturing) return;

    setIsCapturing(true);
    setCaptureFeedback(null);
    try {
      const res = await fetch("/api/v1/tasks/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ raw_input: captureInput.trim() }),
      });
      if (!res.ok) throw new Error("Capture failed");
      const data = await res.json();
      setCaptureInput("");
      setCaptureFeedback(
        `Captured: "${data.task.title}"${data.task.deadline_at ? ` · Due: ${new Date(data.task.deadline_at).toLocaleDateString()}` : ""}`
      );
      fetchTasks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setIsCapturing(false);
    }
  };

  // Handle status transition
  const handleStatusChange = async (task: TaskItem, newStatus: string, note?: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: newStatus,
          completion_note: note,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Status transition failed");
      }
      fetchTasks();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Status transition failed");
    }
  };

  // Handle Reschedule submit
  const handleRescheduleSubmit = async () => {
    if (!rescheduleTask || !accessToken) return;
    try {
      const isoDate = rescheduleDate ? new Date(rescheduleDate).toISOString() : null;
      const res = await fetch(`/api/v1/tasks/${rescheduleTask.id}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          new_deadline_at: isoDate,
          reason: rescheduleReason || null,
        }),
      });
      if (!res.ok) throw new Error("Reschedule failed");
      setRescheduleTask(null);
      setRescheduleDate("");
      setRescheduleReason("");
      fetchTasks();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reschedule failed");
    }
  };

  const getPriorityBadge = (p: number | null) => {
    switch (p) {
      case 1:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-danger/20 text-danger border border-danger/30">P1 Urgent</span>;
      case 2:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning/20 text-warning border border-warning/30">P2 High</span>;
      case 3:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/20 text-primary border border-primary/30">P3 Medium</span>;
      case 4:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface3 text-text-muted border border-border">P4 Low</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Tasks</h1>
          <p className="text-sm text-text-muted mt-1">
            Task lifecycle management, natural-language capture, and status pipelines.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-4 py-1.5 rounded-control bg-surface2 border border-border text-sm text-text focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Quick Capture Input Bar */}
      <form onSubmit={handleCapture} className="relative">
        <div className="flex items-center gap-2 p-2 rounded-control bg-surface border border-border focus-within:border-primary transition">
          <Sparkles className="w-5 h-5 text-primary ml-2 shrink-0" />
          <input
            type="text"
            value={captureInput}
            onChange={(e) => setCaptureInput(e.target.value)}
            placeholder='Capture task naturally, e.g. "Prepare client proposal by tomorrow 5pm #urgent @marketing"'
            className="w-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none px-2"
          />
          <button
            type="submit"
            disabled={!captureInput.trim() || isCapturing}
            className="px-4 py-1.5 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-hover transition disabled:opacity-50 shrink-0"
          >
            {isCapturing ? "Parsing..." : "Capture"}
          </button>
        </div>
        {captureFeedback && (
          <p className="text-xs text-primary mt-1.5 px-2 animate-fadeIn">{captureFeedback}</p>
        )}
      </form>

      {/* View Segment Switcher Tabs */}
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

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-control bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 text-center text-text-muted text-sm animate-pulse">
          Loading tasks...
        </div>
      )}

      {/* Empty State */}
      {!isLoading && tasks.length === 0 && (
        <div className="py-16 text-center border border-dashed border-border rounded-control bg-surface">
          <CheckSquare className="w-10 h-10 mx-auto text-text-muted mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-text">No {segment} tasks</h3>
          <p className="text-sm text-text-muted mt-1 max-w-sm mx-auto">
            {segment === "today"
              ? "All clear for today! Capture a new task above or relax."
              : segment === "upcoming"
              ? "No tasks scheduled for the next 14 days."
              : segment === "backlog"
              ? "Your backlog is empty."
              : "No completed tasks yet."}
          </p>
        </div>
      )}

      {/* Tasks List */}
      {!isLoading && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isDone = task.status === "completed";
            const isProgress = task.status === "in_progress";

            return (
              <div
                key={task.id}
                className="p-4 rounded-control bg-surface border border-border hover:border-border-hover transition space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Status checkbox button */}
                    <button
                      onClick={() => {
                        if (isDone) {
                          handleStatusChange(task, "pending");
                        } else {
                          setCompleteTask(task);
                          setCompletionNote("");
                        }
                      }}
                      className="mt-0.5 text-text-muted hover:text-primary transition shrink-0"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div>
                      <h4
                        className={`text-sm font-medium ${
                          isDone ? "line-through text-text-muted" : "text-text"
                        }`}
                      >
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {getPriorityBadge(task.priority)}

                    {/* In Progress button */}
                    {!isDone && (
                      <button
                        onClick={() =>
                          handleStatusChange(
                            task,
                            isProgress ? "pending" : "in_progress"
                          )
                        }
                        title={isProgress ? "Pause task" : "Start task"}
                        className={`p-1.5 rounded-control border text-xs flex items-center gap-1 transition ${
                          isProgress
                            ? "bg-warning/20 border-warning/30 text-warning"
                            : "bg-surface2 border-border text-text-muted hover:text-text"
                        }`}
                      >
                        {isProgress ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">
                          {isProgress ? "In Progress" : "Start"}
                        </span>
                      </button>
                    )}

                    {/* Reschedule button */}
                    {!isDone && (
                      <button
                        onClick={() => {
                          setRescheduleTask(task);
                          setRescheduleDate(
                            task.deadline_at ? task.deadline_at.slice(0, 16) : ""
                          );
                          setRescheduleReason("");
                        }}
                        title="Reschedule deadline"
                        className="p-1.5 rounded-control bg-surface2 border border-border text-text-muted hover:text-text transition"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Task Metadata Row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted pt-2 border-t border-border/50">
                  {task.deadline_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Due: {new Date(task.deadline_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  )}
                  {task.estimate_user_min && (
                    <span>Est: {task.estimate_user_min}m</span>
                  )}
                  {task.actual_min > 0 && (
                    <span className="text-primary font-medium">Actual: {task.actual_min}m</span>
                  )}
                  {task.reschedule_count > 0 && (
                    <span className="text-warning">Rescheduled: {task.reschedule_count}x</span>
                  )}
                  {task.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-0.5 text-text-muted">
                      <TagIcon className="w-3 h-3" />
                      #{tag}
                    </span>
                  ))}
                  {task.subtasks.length > 0 && (
                    <span>
                      Subtasks: {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-control p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text">Reschedule Task</h3>
              <button
                onClick={() => setRescheduleTask(null)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Changing deadline for: <strong>{rescheduleTask.title}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">New Deadline</label>
                <input
                  type="datetime-local"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-control bg-surface2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="e.g. Blocked on design review"
                  className="w-full px-3 py-2 rounded-control bg-surface2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRescheduleTask(null)}
                className="px-4 py-2 rounded-control bg-surface2 text-sm text-text hover:bg-surface2/80 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRescheduleSubmit}
                className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-hover transition"
              >
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Task with Note Modal */}
      {completeTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-control p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text">Mark Task Completed</h3>
              <button
                onClick={() => setCompleteTask(null)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Complete task: <strong>{completeTask.title}</strong>
            </p>
            <div>
              <label className="text-xs text-text-muted block mb-1">Completion Note / Deliverable (Optional)</label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Summary of outcome or link to deliverable..."
                rows={3}
                className="w-full px-3 py-2 rounded-control bg-surface2 border border-border text-sm text-text focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCompleteTask(null)}
                className="px-4 py-2 rounded-control bg-surface2 text-sm text-text hover:bg-surface2/80 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleStatusChange(completeTask, "completed", completionNote);
                  setCompleteTask(null);
                }}
                className="px-4 py-2 rounded-control bg-success text-white text-sm font-medium hover:bg-success/90 transition"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
