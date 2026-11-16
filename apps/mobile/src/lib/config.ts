/**
 * ALIBI Mobile Configuration & LAN Connectivity Client.
 * Implements AC-M0-2 and AC-UI-6 for configurable backend URL and live health checks.
 */

export interface ServerMeta {
  appName: string;
  version: string;
  environment: string;
  mode: "local" | "hosted";
  timestamp: string;
  status: string;
  database: string;
  responseTimeMs: number;
}

// Candidate server URLs for physical device (127.0.0.1 via ADB reverse), Wi-Fi LAN, and Android emulator
export const CANDIDATE_SERVER_URLS = [
  "http://127.0.0.1:8000",
  "http://192.168.1.37:8000",
  "http://10.0.2.2:8000",
];

// In-memory server URL store
let activeServerUrl = "http://127.0.0.1:8000";

export function getServerUrl(): string {
  return activeServerUrl;
}

export function setServerUrl(url: string): string {
  // Normalize URL - strip trailing slash
  const trimmed = url.trim().replace(/\/+$/, "");
  activeServerUrl = trimmed;
  return activeServerUrl;
}

export async function autoDetectServer(): Promise<string> {
  // First check if current active URL works
  const currentCheck = await pingServer(activeServerUrl);
  if (currentCheck.success) {
    return activeServerUrl;
  }
  // Try candidates in order
  for (const candidate of CANDIDATE_SERVER_URLS) {
    if (candidate === activeServerUrl) continue;
    const res = await pingServer(candidate);
    if (res.success) {
      setServerUrl(candidate);
      return candidate;
    }
  }
  return activeServerUrl;
}

export async function pingServer(customUrl?: string): Promise<{ success: boolean; data?: ServerMeta; error?: string }> {
  const targetUrl = customUrl ? customUrl.trim().replace(/\/+$/, "") : activeServerUrl;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${targetUrl}/api/v1/meta`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const payload = await response.json();
    return {
      success: true,
      data: {
        appName: payload.app_name ?? "ALIBI",
        version: payload.version ?? "0.1.0",
        environment: payload.environment ?? "development",
        mode: payload.mode ?? "local",
        timestamp: payload.timestamp ?? new Date().toISOString(),
        status: payload.status ?? "healthy",
        database: payload.database ?? "connected",
        responseTimeMs: elapsed,
      },
    };
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Connection failed (${elapsed}ms): ${message}`,
    };
  }
}

