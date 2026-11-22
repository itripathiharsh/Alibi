import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import theme from "../lib/theme";
import { ensureAuthenticated } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { formatDayMonthYear, formatMinutes, formatShortDay } from "../lib/time-format";
import { DateChooser, FieldLabel, Sheet } from "./time-pickers";

/**
 * Where recorded work time goes (FR-DASH-010, ADR-032). Every figure comes from
 * GET /api/v1/analytics/time-report, which counts finished work sessions on the server.
 */

type Period = "daily" | "weekly" | "monthly" | "custom";
type Metric = "minutes" | "completed" | "average";

interface ReportTask {
  task_id: string;
  title: string;
  status: string;
  category: string | null;
  minutes: number;
  sessions: number;
  total_minutes: number;
  planned_minutes: number | null;
  difference_minutes: number | null;
}
interface ReportDay { date: string; minutes: number; tasks_completed: number; tasks_worked: number; average_minutes_per_task: number | null }
interface ReportWeek { week_start: string; minutes: number; tasks_completed: number }
interface TimeReport {
  start_date: string;
  end_date: string;
  total_minutes: number;
  today_minutes: number;
  this_week_minutes: number;
  daily_average_minutes: number;
  tasks_completed: number;
  average_completion_minutes: number | null;
  completed_with_time: number;
  tasks: ReportTask[];
  days: ReportDay[];
  weeks: ReportWeek[];
  categories: { category: string; completed_tasks: number; average_minutes: number }[];
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This week" },
  { key: "monthly", label: "This month" },
  { key: "custom", label: "Custom" },
];
const PEN = "#E0612A";

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function TimeReportSection() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [from, setFrom] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 13); return d; });
  const [to, setTo] = useState<Date>(() => new Date());
  const [picking, setPicking] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [report, setReport] = useState<TimeReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [metric, setMetric] = useState<Metric>("minutes");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const token = await ensureAuthenticated();
      if (!token) { setState("error"); return; }
      const query = period === "custom" ? `period=custom&from=${ymd(from)}&to=${ymd(to)}` : `period=${period}`;
      const response = await fetch(`${getServerUrl()}/api/v1/analytics/time-report?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!response.ok) { setState("error"); return; }
      setReport(await response.json() as TimeReport);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [from, period, to]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const chart = useMemo(() => {
    if (!report) return [];
    const useWeeks = report.days.length > 35;
    if (useWeeks) {
      return report.weeks.map((w) => ({
        label: formatShortDay(parseYmd(w.week_start)).split(" ").slice(1).join(" "),
        value: metric === "minutes" ? w.minutes : metric === "completed" ? w.tasks_completed : null,
      }));
    }
    return report.days.map((d) => ({
      label: report.days.length <= 7 ? formatShortDay(parseYmd(d.date)).split(" ")[0] : String(parseYmd(d.date).getDate()),
      value: metric === "minutes" ? d.minutes : metric === "completed" ? d.tasks_completed : d.average_minutes_per_task,
    }));
  }, [metric, report]);
  const max = Math.max(1, ...chart.map((c) => c.value ?? 0));
  const peak = chart.reduce((best, c, i) => ((c.value ?? 0) > (chart[best]?.value ?? 0) ? i : best), 0);
  const planned = report?.tasks.filter((t) => t.planned_minutes !== null) ?? [];
  const tasks = report ? (showAll ? report.tasks : report.tasks.slice(0, 5)) : [];

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Time</Text>
      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => {
              if (p.key === "custom") { setDraftFrom(from); setDraftTo(to); setPicking(true); }
              else setPeriod(p.key);
            }}
            style={[styles.period, period === p.key && styles.periodActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p.key }}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {report && period === "custom" ? (
        <Text style={styles.range}>{formatDayMonthYear(parseYmd(report.start_date))} – {formatDayMonthYear(parseYmd(report.end_date))}</Text>
      ) : null}

      {state === "loading" && !report ? <ActivityIndicator color={PEN} style={{ marginVertical: 20 }} /> : null}
      {state === "error" && !report ? (
        <Text style={styles.empty}>Time figures need a connection to ALIBI. Pull down to try again.</Text>
      ) : null}

      {report ? (
        <>
          <View style={styles.kpis}>
            <Kpi label="Productive time" value={formatMinutes(report.total_minutes)} />
            <Kpi label="Daily average" value={formatMinutes(report.daily_average_minutes)} />
            <Kpi label="Tasks completed" value={String(report.tasks_completed)} />
            <Kpi label="Average per completed task" value={report.average_completion_minutes !== null ? formatMinutes(report.average_completion_minutes) : "No timed tasks"} />
          </View>
          <Text style={styles.small}>Today {formatMinutes(report.today_minutes)}, this week {formatMinutes(report.this_week_minutes)}</Text>

          {report.total_minutes === 0 && report.tasks_completed === 0 ? (
            <Text style={styles.empty}>No work recorded in this period. Tap ▶ on a task in Today to start tracking.</Text>
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.metricTabs}>
                  {([["minutes", "Time"], ["completed", "Tasks done"], ["average", "Per task"]] as [Metric, string][]).map(([key, label]) => (
                    <Pressable key={key} onPress={() => setMetric(key)} style={[styles.metricTab, metric === key && styles.metricTabActive]} accessibilityRole="button">
                      <Text style={[styles.metricText, metric === key && styles.metricTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {metric === "average" && report.days.length > 35 ? (
                  <Text style={styles.small}>Pick a shorter range to see time per task by day.</Text>
                ) : (
                  <View style={styles.bars}>
                    {chart.map((c, i) => (
                      <View key={`${c.label}-${i}`} style={styles.barCol}>
                        <Text style={styles.barValue}>
                          {i === peak && (c.value ?? 0) > 0 ? (metric === "completed" ? String(c.value) : formatMinutes(c.value ?? 0)) : ""}
                        </Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.bar, { height: `${Math.round(((c.value ?? 0) / max) * 100)}%` }]} />
                        </View>
                        {chart.length <= 14 || i % Math.ceil(chart.length / 7) === 0 ? <Text style={styles.barLabel}>{c.label}</Text> : <Text style={styles.barLabel}> </Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <Text style={styles.subheading}>Where your time went</Text>
              <View style={styles.card}>
                {tasks.length === 0 ? <Text style={styles.small}>No timed work in this period.</Text> : tasks.map((t, i) => (
                  <View key={t.task_id} style={[styles.row, i > 0 && styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{t.title}</Text>
                      <Text style={styles.rowMeta}>{t.sessions} {t.sessions === 1 ? "session" : "sessions"}{t.category ? ` · ${t.category}` : ""}</Text>
                    </View>
                    <Text style={styles.rowValue}>{formatMinutes(t.minutes)}</Text>
                  </View>
                ))}
                {report.tasks.length > 5 ? (
                  <Pressable onPress={() => setShowAll((v) => !v)} style={styles.more} accessibilityRole="button">
                    <Text style={styles.moreText}>{showAll ? "Show top 5" : `Show all ${report.tasks.length}`}</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.subheading}>Planned vs actual</Text>
              <View style={styles.card}>
                {planned.length === 0 ? (
                  <Text style={styles.small}>None of these tasks had a time estimate.</Text>
                ) : planned.map((t, i) => {
                  const diff = t.difference_minutes ?? 0;
                  return (
                    <View key={t.task_id} style={[styles.row, i > 0 && styles.rowDivider]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={2}>{t.title}</Text>
                        <Text style={styles.rowMeta}>Planned {formatMinutes(t.planned_minutes ?? 0)} · actual {formatMinutes(t.total_minutes)}</Text>
                      </View>
                      <Text style={[styles.rowValue, { color: diff > 0 ? "#B42318" : "#067647" }]}>
                        {diff === 0 ? "On plan" : `${diff > 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))}`}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {report.categories.length > 0 ? (
                <>
                  <Text style={styles.subheading}>Average per completed task</Text>
                  <View style={styles.card}>
                    {report.categories.map((c, i) => (
                      <View key={c.category} style={[styles.row, i > 0 && styles.rowDivider]}>
                        <Text style={[styles.rowTitle, { flex: 1 }]}>{c.category}</Text>
                        <Text style={styles.rowMeta}>{c.completed_tasks} done</Text>
                        <Text style={[styles.rowValue, { marginLeft: 12 }]}>{formatMinutes(c.average_minutes)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}

      <Sheet
        visible={picking}
        title="Custom range"
        primaryLabel="Show"
        onClose={() => setPicking(false)}
        primaryDisabled={!draftFrom || !draftTo}
        onPrimary={() => {
          if (!draftFrom || !draftTo) return;
          const [a, b] = draftFrom <= draftTo ? [draftFrom, draftTo] : [draftTo, draftFrom];
          setFrom(a);
          setTo(b);
          setPeriod("custom");
          setPicking(false);
        }}
      >
        <FieldLabel>From</FieldLabel>
        <DateChooser value={draftFrom} onChange={setDraftFrom} />
        <FieldLabel>To</FieldLabel>
        <DateChooser value={draftTo} onChange={setDraftTo} />
      </Sheet>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heading: { fontSize: 20, fontWeight: "800", color: theme.colors.text.primary },
  subheading: { fontSize: 15, fontWeight: "800", color: theme.colors.text.primary, marginTop: 6 },
  periods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  period: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F1F3F5" },
  periodActive: { backgroundColor: theme.colors.brand.navy },
  periodText: { fontSize: 13, fontWeight: "700", color: theme.colors.text.secondary },
  periodTextActive: { color: "#FFFFFF" },
  range: { fontSize: 13, color: theme.colors.text.secondary },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { flexBasis: "48%", flexGrow: 1, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: 12, gap: 4 },
  kpiLabel: { fontSize: 12, color: theme.colors.text.secondary },
  kpiValue: { fontSize: 20, fontWeight: "800", color: theme.colors.text.primary },
  small: { fontSize: 12, color: theme.colors.text.secondary },
  empty: { fontSize: 13, lineHeight: 19, color: theme.colors.text.secondary, paddingVertical: 8 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: 14, gap: 10 },
  metricTabs: { flexDirection: "row", gap: 6 },
  metricTab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  metricTabActive: { backgroundColor: "#FFF2E8" },
  metricText: { fontSize: 12, fontWeight: "700", color: theme.colors.text.secondary },
  metricTextActive: { color: PEN },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 140 },
  barCol: { flex: 1, alignItems: "center", gap: 3, height: "100%" },
  barValue: { fontSize: 10, fontWeight: "700", color: theme.colors.text.primary, height: 14 },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", minHeight: 2, borderRadius: 4, backgroundColor: PEN },
  barLabel: { fontSize: 10, color: theme.colors.text.muted, height: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: "#F1ECE6", paddingTop: 10 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.text.primary },
  rowMeta: { fontSize: 12, color: theme.colors.text.secondary, marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: "800", color: theme.colors.text.primary },
  more: { alignItems: "center", paddingTop: 4 },
  moreText: { fontSize: 13, fontWeight: "700", color: PEN },
});
