import * as SecureStore from "expo-secure-store";
import { getAccessToken, getRefreshToken, getUserProfile } from "./auth";
import { getDatabase } from "./offline-sync";

const FIRST_LAUNCH_INTRO_KEY = "alibi_first_launch_intro_seen_v1";
const LEGACY_LOCAL_TABLES = ["local_tasks", "task_views", "sync_state"] as const;

async function markIntroSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(FIRST_LAUNCH_INTRO_KEY, "true");
  } catch {
    // A storage failure should never keep the user out of the app.
  }
}

async function hasLegacyLocalData(): Promise<boolean> {
  try {
    const database = await getDatabase();
    const placeholders = LEGACY_LOCAL_TABLES.map(() => "?").join(", ");
    const tables = await database.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders}) LIMIT 1`,
      ...LEGACY_LOCAL_TABLES,
    );
    return tables.length > 0;
  } catch {
    return false;
  }
}

/** Play once on fresh installs, while keeping existing signed-in or offline users on their usual route. */
export async function shouldShowFirstLaunchIntro(): Promise<boolean> {
  let seen: string | null;
  try {
    seen = await SecureStore.getItemAsync(FIRST_LAUNCH_INTRO_KEY);
  } catch {
    return false;
  }
  if (seen === "true") return false;

  const [accessToken, refreshToken, profile] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getUserProfile(),
  ]).catch(() => [null, null, null] as const);
  if (accessToken || refreshToken || profile || await hasLegacyLocalData()) {
    await markIntroSeen();
    return false;
  }
  return true;
}

export async function completeFirstLaunchIntro(): Promise<void> {
  await markIntroSeen();
}
