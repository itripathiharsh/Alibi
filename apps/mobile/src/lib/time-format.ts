/**
 * 12-hour clock formatting used everywhere a time is shown (ADR-032).
 * Built by hand rather than with toLocaleTimeString, whose output depends on the phone's
 * locale and Hermes' Intl support (some phones showed 24-hour times). Values stay ISO/UTC
 * in storage; only the display changes.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "09:05 AM", "06:45 PM". */
export function formatClock(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "22 Nov 2026". */
export function formatDayMonthYear(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Mon 23 Nov". */
export function formatShortDay(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "Today 06:00 PM", "Tomorrow 09:00 AM", "Mon 23 Nov 06:00 PM". */
export function formatWhen(value: Date | string | number, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const clock = formatClock(date);
  if (date.toDateString() === now.toDateString()) return `Today ${clock}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${clock}`;
  return `${formatShortDay(date)} ${clock}`;
}

/** "45 min", "1 h 05 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}

/** Live stopwatch "12:05" or "1:02:05" from a start timestamp. */
export function formatElapsed(fromMs: number, nowMs: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
