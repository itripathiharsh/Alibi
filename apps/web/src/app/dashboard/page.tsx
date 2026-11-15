"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  PieChart as PieIcon,
  Table,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Period = "daily" | "weekly" | "monthly" | "custom";

interface SummaryData {
  period: Period;
  total_time_min: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  efficiency: number | null;
  estimate_accuracy: number | null;
}

interface ScoreData {
  score: number | null;
  formula_version: number;
  period: Period;
  completion_component: number | null;
  on_time_component: number | null;
  accuracy_component: number | null;
  insufficient_data: boolean;
  message: string | null;
}

interface CompletionPoint {
  date: string;
  completed_count: number;
}

interface TimeDistItem {
  category_name: string;
  category_color: string;
  total_min: number;
  percentage: number;
}

interface EstVsActualItem {
  task_id: string;
  title: string;
  category_name: string;
  estimate_min: number;
  actual_min: number;
  ratio: number;
}

interface HeatmapItem {
  date: string;
  completed_count: number;
  minutes_logged: number;
}

interface FormulaData {
  formula_version: number;
  description: string;
  weights: Record<string, number>;
  rules: string[];
  components: Record<string, string>;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [trend, setTrend] = useState<CompletionPoint[]>([]);
  const [timeDist, setTimeDist] = useState<TimeDistItem[]>([]);
  const [estVsActual, setEstVsActual] = useState<EstVsActualItem[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapItem[]>([]);
  const [formula, setFormula] = useState<FormulaData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  // Table toggle states for accessibility (AC-M3-5)
  const [showTrendTable, setShowTrendTable] = useState(false);
  const [showDistTable, setShowDistTable] = useState(false);
  const [showEvaTable, setShowEvaTable] = useState(false);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        setError(null);

        const [sRes, scRes, tRes, tdRes, evaRes, hmRes, fRes] = await Promise.all([
          api.GET("/api/v1/analytics/summary", { params: { query: { period } } }),
          api.GET("/api/v1/analytics/productivity-score", { params: { query: { period } } }),
          api.GET("/api/v1/analytics/charts/completion-trend", { params: { query: { period } } }),
          api.GET("/api/v1/analytics/charts/time-distribution", { params: { query: { period } } }),
          api.GET("/api/v1/analytics/charts/est-vs-actual", { params: { query: { period } } }),
          api.GET("/api/v1/analytics/charts/consistency-heatmap", { params: { query: { days: 365 } } }),
          api.GET("/api/v1/analytics/formula"),
        ]);

        if (sRes.data) setSummary(sRes.data as unknown as SummaryData);
        if (scRes.data) setScore(scRes.data as unknown as ScoreData);
        if (tRes.data) setTrend(tRes.data as unknown as CompletionPoint[]);
        if (tdRes.data) setTimeDist(tdRes.data as unknown as TimeDistItem[]);
        if (evaRes.data) setEstVsActual(evaRes.data as unknown as EstVsActualItem[]);
        if (hmRes.data) setHeatmap(hmRes.data as unknown as HeatmapItem[]);
        if (fRes.data) setFormula(fRes.data as unknown as FormulaData);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [period]);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header and Period Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Productivity Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">
            Deterministic metrics, planning accuracy, and transparent performance scores.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center rounded-control bg-surface2 p-1 border border-border w-fit">
          {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-control capitalize transition-colors ${
                period === p
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {p === "daily" ? "Today" : p === "weekly" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-card bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Section: Score Ring Card & Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Productivity Score Ring */}
        <div className="p-6 rounded-card bg-surface border border-border flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-text">Productivity Score</h2>
            </div>
            <button
              onClick={() => setShowFormulaModal(true)}
              className="text-xs text-text-muted hover:text-primary flex items-center gap-1 transition-colors"
              title="View formula sheet"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Formula</span>
            </button>
          </div>

          <div className="my-6 flex flex-col items-center justify-center">
            {loading ? (
              <div className="w-32 h-32 rounded-full border-4 border-surface2 border-t-primary animate-spin" />
            ) : !score || score.insufficient_data || score.score === null ? (
              <div className="w-36 h-36 rounded-full border-4 border-dashed border-border flex flex-col items-center justify-center text-center p-3">
                <span className="text-xs font-medium text-text-muted">Not enough data</span>
                <span className="text-[10px] text-text-muted/70 mt-1">(&lt; 3 tasks)</span>
              </div>
            ) : (
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-surface2"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-primary transition-all duration-700 ease-out"
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - (score.score ?? 0) / 100)}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center animate-scaleIn">
                  <span className="text-4xl font-extrabold tabular-nums text-text">
                    {score.score}
                  </span>
                  <span className="text-[10px] text-text-muted tracking-wide uppercase">out of 100</span>
                </div>
              </div>
            )}
          </div>

          {/* Component Breakdown */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border text-center">
            <div>
              <p className="text-[11px] text-text-muted">Completion</p>
              <p className="text-sm font-semibold text-text mt-0.5">
                {score?.completion_component !== null && score?.completion_component !== undefined
                  ? `${Math.round(score.completion_component * 100)}%`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-muted">On-Time</p>
              <p className="text-sm font-semibold text-text mt-0.5">
                {score?.on_time_component !== null && score?.on_time_component !== undefined
                  ? `${Math.round(score.on_time_component * 100)}%`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-muted">Accuracy</p>
              <p className="text-sm font-semibold text-text mt-0.5">
                {score?.accuracy_component !== null && score?.accuracy_component !== undefined
                  ? `${Math.round(score.accuracy_component * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* 6 Core Metric Tiles */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-card bg-surface border border-border shadow-sm card-interactive">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <Clock className="w-4 h-4 text-primary" />
              <span>Time Spent</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-text mt-2">
              {loading ? "..." : formatHours(summary?.total_time_min || 0)}
            </p>
            <p className="text-[11px] text-text-muted mt-1">Logged in period</p>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-sm card-interactive">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span>Completed</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-text mt-2">
              {loading ? "..." : summary?.tasks_completed ?? 0}
            </p>
            <p className="text-[11px] text-text-muted mt-1">Tasks finished</p>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-sm card-interactive">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <Activity className="w-4 h-4 text-primary" />
              <span>Pending</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-text mt-2">
              {loading ? "..." : summary?.tasks_pending ?? 0}
            </p>
            <p className="text-[11px] text-text-muted mt-1">Open tasks</p>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-sm card-interactive">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <AlertTriangle className="w-4 h-4 text-danger" />
              <span>Past Deadline</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums mt-2 ${(summary?.tasks_overdue || 0) > 0 ? "text-danger" : "text-text"}`}>
              {loading ? "..." : summary?.tasks_overdue ?? 0}
            </p>
            <p className="text-[11px] text-text-muted mt-1">Overdue items</p>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-sm card-interactive">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <Target className="w-4 h-4 text-accent" />
              <span>Completion Rate</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-text mt-2">
              {loading
                ? "..."
                : summary?.completion_rate !== null && summary?.completion_rate !== undefined
                ? `${Math.round(summary.completion_rate * 100)}%`
                : "—"}
            </p>
            <p className="text-[11px] text-text-muted mt-1">
              {summary?.completion_rate === null ? "Insufficient data" : "Due vs finished"}
            </p>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-sm card-interactive">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <TrendingUp className="w-4 h-4 text-warning" />
              <span>Efficiency</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-text mt-2">
              {loading
                ? "..."
                : summary?.efficiency !== null && summary?.efficiency !== undefined
                ? `${summary.efficiency}×`
                : "—"}
            </p>
            <p className="text-[11px] text-text-muted mt-1">
              {summary?.efficiency === null ? "Insufficient data" : "Actual vs estimated"}
            </p>
          </div>
        </div>
      </div>

      {/* Visualizations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Completion Trend */}
        <div className="p-6 rounded-card bg-surface border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-text text-sm">Completion Trend</h3>
            </div>
            <button
              onClick={() => setShowTrendTable(!showTrendTable)}
              className="text-xs text-text-muted hover:text-text flex items-center gap-1 border border-border rounded px-2 py-1"
              aria-label="Toggle completion trend data table"
            >
              <Table className="w-3.5 h-3.5" />
              <span>{showTrendTable ? "Show Chart" : "Show Table"}</span>
            </button>
          </div>

          {showTrendTable ? (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border text-text-muted">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2 text-right">Completions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {trend.map((p) => (
                    <tr key={p.date}>
                      <td className="py-2 text-text">{p.date}</td>
                      <td className="py-2 text-right font-medium text-text">{p.completed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-64 w-full">
              {trend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">
                  No completions in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend}>
                    <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1E293B", border: "none", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Bar dataKey="completed_count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Completed Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        {/* Chart 2: Time Distribution by Category */}
        <div className="p-6 rounded-card bg-surface border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-accent" />
              <h3 className="font-semibold text-text text-sm">Time by Category</h3>
            </div>
            <button
              onClick={() => setShowDistTable(!showDistTable)}
              className="text-xs text-text-muted hover:text-text flex items-center gap-1 border border-border rounded px-2 py-1"
              aria-label="Toggle time distribution data table"
            >
              <Table className="w-3.5 h-3.5" />
              <span>{showDistTable ? "Show Chart" : "Show Table"}</span>
            </button>
          </div>

          {showDistTable ? (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border text-text-muted">
                  <tr>
                    <th className="py-2">Category</th>
                    <th className="py-2 text-right">Time</th>
                    <th className="py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {timeDist.map((item) => (
                    <tr key={item.category_name}>
                      <td className="py-2 text-text flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.category_color }} />
                        {item.category_name}
                      </td>
                      <td className="py-2 text-right font-medium text-text">{formatHours(item.total_min)}</td>
                      <td className="py-2 text-right text-text-muted">{item.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-64 w-full">
              {timeDist.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">
                  No time logged in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={timeDist}
                      dataKey="total_min"
                      nameKey="category_name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {timeDist.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.category_color || "#3B82F6"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: unknown) => [formatHours(Number(val) || 0), "Time Logged"]}
                      contentStyle={{ backgroundColor: "#1E293B", border: "none", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chart 3: Estimated vs Actual Comparison */}
      <div className="p-6 rounded-card bg-surface border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-warning" />
            <h3 className="font-semibold text-text text-sm">Estimated vs. Actual Duration</h3>
          </div>
          <button
            onClick={() => setShowEvaTable(!showEvaTable)}
            className="text-xs text-text-muted hover:text-text flex items-center gap-1 border border-border rounded px-2 py-1"
            aria-label="Toggle estimated vs actual data table"
          >
            <Table className="w-3.5 h-3.5" />
            <span>{showEvaTable ? "Show Chart" : "Show Table"}</span>
          </button>
        </div>

        {showEvaTable ? (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th className="py-2">Task</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Estimate</th>
                  <th className="py-2 text-right">Actual</th>
                  <th className="py-2 text-right">Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {estVsActual.map((item) => (
                  <tr key={item.task_id}>
                    <td className="py-2 text-text font-medium">{item.title}</td>
                    <td className="py-2 text-text-muted">{item.category_name}</td>
                    <td className="py-2 text-right text-text-muted">{formatHours(item.estimate_min)}</td>
                    <td className="py-2 text-right text-text">{formatHours(item.actual_min)}</td>
                    <td className="py-2 text-right font-medium text-text">{item.ratio}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64 w-full">
            {estVsActual.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-text-muted">
                No completed tasks with estimates in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={estVsActual.slice(0, 8)}>
                  <XAxis dataKey="title" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} unit="m" />
                  <Tooltip
                    formatter={(val: unknown) => [`${val} min`, ""]}
                    contentStyle={{ backgroundColor: "#1E293B", border: "none", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend />
                  <Bar dataKey="estimate_min" fill="#64748B" name="Estimated (min)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual_min" fill="#10B981" name="Actual (min)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Chart 4: 1-Year Consistency Heatmap */}
      <div className="p-6 rounded-card bg-surface border border-border shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-text text-sm">Consistency Heatmap (1 Year)</h3>
        </div>

        {heatmap.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-xs text-text-muted">
            No activity recorded yet
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto pb-2">
              <div className="inline-grid grid-rows-7 grid-flow-col gap-1">
                {heatmap.map((day) => {
                  const level =
                    day.completed_count >= 5 || day.minutes_logged >= 180
                      ? "bg-emerald-600"
                      : day.completed_count >= 3 || day.minutes_logged >= 90
                      ? "bg-emerald-500"
                      : day.completed_count >= 1 || day.minutes_logged >= 30
                      ? "bg-emerald-400"
                      : day.minutes_logged > 0
                      ? "bg-emerald-300"
                      : "bg-surface2";

                  return (
                    <div
                      key={day.date}
                      className={`w-3 h-3 rounded-sm ${level} transition-transform hover:scale-125 cursor-pointer`}
                      title={`${day.date}: ${day.completed_count} tasks, ${formatHours(day.minutes_logged)}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-text-muted pt-2 border-t border-border">
              <span>Showing last 365 days of activity</span>
              <div className="flex items-center gap-1.5">
                <span>Less</span>
                <span className="w-2.5 h-2.5 rounded-sm bg-surface2" />
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                <span>More</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Formula Modal Sheet */}
      {showFormulaModal && formula && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-sheet max-w-lg w-full p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-text text-base">Formula Specification (v{formula.formula_version})</h3>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="text-text-muted hover:text-text p-1 rounded-control"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              {formula.description}
            </p>

            <div className="p-3 rounded-card bg-surface2 border border-border text-xs font-mono text-text">
              Score = round(100 × (0.5·C + 0.3·O + 0.2·A))
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wider">Formula Components</h4>
              <div className="space-y-2 text-xs">
                {Object.entries(formula.components).map(([k, v]) => (
                  <div key={k} className="p-2.5 rounded bg-surface2/50 border border-border/50">
                    <span className="font-semibold text-primary">{k}: </span>
                    <span className="text-text-muted">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wider">Invariance Rules</h4>
              <ul className="list-disc list-inside space-y-1 text-xs text-text-muted">
                {formula.rules.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setShowFormulaModal(false)}
              className="w-full py-2.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
