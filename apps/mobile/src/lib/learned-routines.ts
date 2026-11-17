/** FR-LEARN-002: show only recurring task patterns supported by the user's own history. */
export interface LearnedTaskRoutine {
  label: string;
  confidence: number;
  sample_count: number;
}

interface LearningProfileResponse {
  routines?: Array<{
    label?: unknown;
    confidence?: unknown;
    sample_count?: unknown;
  }>;
}

export function filterLearnedTaskRoutines(
  routines: LearningProfileResponse["routines"],
): LearnedTaskRoutine[] {
  const labels = new Set<string>();
  return (routines ?? [])
    .filter((routine) => {
      const label = typeof routine.label === "string" ? routine.label.trim() : "";
      const confidence = typeof routine.confidence === "number" ? routine.confidence : 0;
      const sampleCount = typeof routine.sample_count === "number" ? routine.sample_count : 0;
      if (!label || confidence < 0.7 || sampleCount < 4 || labels.has(label.toLowerCase())) return false;
      labels.add(label.toLowerCase());
      return true;
    })
    .map((routine) => ({
      label: (routine.label as string).trim(),
      confidence: routine.confidence as number,
      sample_count: routine.sample_count as number,
    }))
    .slice(0, 3);
}

export async function loadLearnedTaskRoutines(
  baseUrl: string,
  token: string,
): Promise<LearnedTaskRoutine[]> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/learning/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return [];

    const profile = (await response.json()) as LearningProfileResponse;
    return filterLearnedTaskRoutines(profile.routines);
  } catch {
    return [];
  }
}
