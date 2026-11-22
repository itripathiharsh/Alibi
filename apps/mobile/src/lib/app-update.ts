/**
 * In-app updates for the sideloaded Android APK (FR-PROD-013, ADR-031).
 *
 * The app reads a small release manifest (apk/latest.json in the GitHub repo). When it
 * lists a higher versionCode than the installed app, the user is offered the update; one
 * tap downloads it, checks its SHA-256 and opens Android's own install confirmation.
 * Android never allows a silent self-update for sideloaded apps.
 */
import * as SecureStore from "expo-secure-store";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export const UPDATE_MANIFEST_URL = "https://raw.githubusercontent.com/itripathiharsh/Alibi/main/apk/latest.json";

const AUTO_CHECK_KEY = "alibi_update_auto_check";
const LAST_CHECK_KEY = "alibi_update_last_check";
const SNOOZE_KEY = "alibi_update_snooze";
const CHECK_EVERY_MS = 6 * 3_600_000;
const SNOOZE_MS = 24 * 3_600_000;

interface UpdaterNative {
  getInstalledVersion(): Promise<{ versionCode: number; versionName: string }>;
  canInstallUpdates(): Promise<boolean>;
  openInstallPermissionSettings(): void;
  downloadAndInstall(url: string, sha256: string): Promise<boolean>;
}

const native: UpdaterNative | undefined =
  Platform.OS === "android" ? (NativeModules.AlibiUpdater as UpdaterNative | undefined) : undefined;

export interface ReleaseInfo {
  versionCode: number;
  versionName: string;
  url: string;
  sha256: string;
  notes: string[];
  installedVersionName: string;
}

export async function getInstalledVersion(): Promise<{ versionCode: number; versionName: string } | null> {
  try {
    return native ? await native.getInstalledVersion() : null;
  } catch {
    return null;
  }
}

export async function isAutoUpdateCheckEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(AUTO_CHECK_KEY)) !== "false";
  } catch {
    return true;
  }
}

export async function setAutoUpdateCheckEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(AUTO_CHECK_KEY, String(enabled));
}

function isRelease(value: unknown): value is Omit<ReleaseInfo, "installedVersionName"> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.versionCode === "number"
    && typeof v.versionName === "string"
    && typeof v.url === "string" && v.url.startsWith("https://")
    && typeof v.sha256 === "string" && /^[0-9a-f]{64}$/i.test(v.sha256)
    && (v.notes === undefined || Array.isArray(v.notes));
}

/**
 * Returns the newer release, or null. `manual` ignores the auto-check switch, the
 * check interval and a "Later" snooze.
 */
export async function checkForUpdate(manual = false): Promise<ReleaseInfo | null> {
  if (!native) return null;
  if (!manual) {
    if (!(await isAutoUpdateCheckEnabled())) return null;
    const last = Number(await SecureStore.getItemAsync(LAST_CHECK_KEY).catch(() => null)) || 0;
    if (Date.now() - last < CHECK_EVERY_MS) return null;
  }
  const installed = await getInstalledVersion();
  if (!installed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let manifest: unknown;
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    manifest = await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  await SecureStore.setItemAsync(LAST_CHECK_KEY, String(Date.now())).catch(() => undefined);
  if (!isRelease(manifest) || manifest.versionCode <= installed.versionCode) return null;

  if (!manual) {
    const snooze = await SecureStore.getItemAsync(SNOOZE_KEY).catch(() => null);
    const [code, until] = (snooze ?? "").split(":").map(Number);
    if (code === manifest.versionCode && until > Date.now()) return null;
  }
  return {
    versionCode: manifest.versionCode,
    versionName: manifest.versionName,
    url: manifest.url,
    sha256: manifest.sha256,
    notes: (manifest.notes ?? []).filter((note): note is string => typeof note === "string").slice(0, 6),
    installedVersionName: installed.versionName,
  };
}

export async function snoozeUpdate(release: ReleaseInfo): Promise<void> {
  await SecureStore.setItemAsync(SNOOZE_KEY, `${release.versionCode}:${Date.now() + SNOOZE_MS}`).catch(() => undefined);
}

export type InstallOutcome = "installer_opened" | "needs_permission";

/** Downloads, verifies and opens Android's installer. */
export async function installUpdate(
  release: ReleaseInfo,
  onProgress?: (fraction: number | null) => void,
): Promise<InstallOutcome> {
  if (!native) throw new Error("Updates are only available on Android.");
  if (!(await native.canInstallUpdates())) {
    native.openInstallPermissionSettings();
    return "needs_permission";
  }
  const emitter = new NativeEventEmitter(NativeModules.AlibiUpdater);
  const subscription = emitter.addListener("AlibiUpdaterProgress", (event: { done: number; total: number }) => {
    onProgress?.(event.total > 0 ? Math.min(1, event.done / event.total) : null);
  });
  try {
    await native.downloadAndInstall(release.url, release.sha256);
    return "installer_opened";
  } finally {
    subscription.remove();
  }
}
