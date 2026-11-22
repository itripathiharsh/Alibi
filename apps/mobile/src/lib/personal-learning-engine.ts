import { saveLocalUserPreferences, getLocalUserPreferences, type LocalUserPreferences } from "./offline-sync";

/** Mirrors backend `DurationPredictionResponse` (doc 07 §5). `maturity_level` is 0 (cold) to 3. */
export interface DurationPrediction {
  p50_min: number;
  p10_min: number | null;
  p90_min: number | null;
  confidence: number;
  maturity_level: number;
  correction_factor: number | null;
  explanation: string | null;
}

/**
 * Ask the backend Personal Learning Engine for a duration prediction.
 *
 * Returns null when the server can't be reached. The app does not compute its own estimate
 * or confidence on the device: numbers shown to the user come from the backend's SQL-backed
 * model only (AGENTS.md §2, §7).
 */
export async function predictTaskDuration(
  baseUrl: string,
  token: string | null,
  title: string,
  userEstimateMin?: number | null,
  categoryId?: string | null,
): Promise<DurationPrediction | null> {
  if (!token || !baseUrl) return null;
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
    if (!response.ok) return null;
    return (await response.json()) as DurationPrediction;
  } catch {
    return null;
  }
}

export async function resetLearningProfile(
  baseUrl: string,
  token: string | null,
): Promise<{ success: boolean; message: string }> {
  if (token && baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/learning/reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        return {
          success: true,
          message: "Your learned patterns and estimates were reset. Your tasks were not changed.",
        };
      }
    } catch {
      // Backend unreachable or offline
    }
  }

  return {
    success: false,
    message: "Couldn't reach the server, so nothing was reset. Try again when you're online.",
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
