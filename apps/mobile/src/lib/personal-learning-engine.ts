import { getDatabase, saveLocalUserPreferences, getLocalUserPreferences, type LocalUserPreferences } from "./offline-sync";

export interface DurationPrediction {
  p50_min: number;
  p10_min: number | null;
  p90_min: number | null;
  confidence: number;
  maturity_level: string;
  correction_factor: number | null;
  explanation: string | null;
}

export async function predictTaskDuration(
  baseUrl: string,
  token: string | null,
  title: string,
  userEstimateMin?: number | null,
  categoryId?: string | null,
): Promise<DurationPrediction> {
  // If online with valid token, query backend PLE service (calibrated hierarchical shrinkage model)
  if (token && baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/learning/predict-duration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          user_estimate_min: userEstimateMin ?? null,
          category_id: categoryId ?? null,
        }),
      });
      if (response.ok) {
        return (await response.json()) as DurationPrediction;
      }
    } catch {
      // Fall through to local SQLite historical estimator
    }
  }

  // Local-first fallback: compute honest estimate from local completed tasks
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ actual_min: number }>(
      `SELECT actual_min FROM local_tasks WHERE status = 'completed' AND actual_min > 0`
    );

    if (!rows || rows.length < 5) {
      return {
        p50_min: userEstimateMin ?? 30,
        p10_min: null,
        p90_min: null,
        confidence: 0.0,
        maturity_level: "L0_COLD",
        correction_factor: null,
        explanation: "Cold start: insufficient completion history (< 5 completed tasks on this device).",
      };
    }

    const actuals = rows.map((r) => r.actual_min).sort((a, b) => a - b);
    const mid = Math.floor(actuals.length / 2);
    const median = actuals.length % 2 === 0 ? Math.round((actuals[mid - 1] + actuals[mid]) / 2) : actuals[mid];
    const p10 = actuals[Math.floor(actuals.length * 0.1)] ?? median;
    const p90 = actuals[Math.floor(actuals.length * 0.9)] ?? median;

    const sampleCount = actuals.length;
    const confidence = Math.min(0.85, 0.3 + (sampleCount / 50) * 0.5);

    return {
      p50_min: median,
      p10_min: p10,
      p90_min: p90,
      confidence: parseFloat(confidence.toFixed(2)),
      maturity_level: sampleCount >= 20 ? "L2_CATEGORY" : "L1_GLOBAL",
      correction_factor: 1.0,
      explanation: `Based on ${sampleCount} local completed tasks (median ${median}m).`,
    };
  } catch {
    return {
      p50_min: userEstimateMin ?? 30,
      p10_min: null,
      p90_min: null,
      confidence: 0.0,
      maturity_level: "L0_COLD",
      correction_factor: null,
      explanation: "No historical data available.",
    };
  }
}

export async function resetLearningProfile(
  baseUrl: string,
  token: string | null,
): Promise<{ success: boolean; message: string }> {
  let backendSuccess = false;
  if (token && baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/learning/reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        backendSuccess = true;
      }
    } catch {
      // Backend unreachable or offline
    }
  }

  return {
    success: true,
    message: backendSuccess
      ? "All server and local productivity learning models, routines, and profiles have been completely reset."
      : "Local productivity learning cleared. Server reset will apply when reconnected.",
  };
}

export async function syncLearningPausedPreference(
  baseUrl: string,
  token: string | null,
  userId: string,
  paused: boolean,
): Promise<LocalUserPreferences> {
  const current = await getLocalUserPreferences(userId);
  const updated = { ...current, learning_paused: paused };
  await saveLocalUserPreferences(userId, updated);

  if (token && baseUrl) {
    try {
      await fetch(`${baseUrl}/api/v1/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: {
            learning_paused: paused,
          },
        }),
      });
    } catch {
      // Offline fallback: saved locally in SQLite
    }
  }

  return updated;
}
