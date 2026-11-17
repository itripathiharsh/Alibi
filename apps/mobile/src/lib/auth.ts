/**
 * ALIBI Mobile Authentication & Secure Token Storage (M1 Task 9).
 * Uses expo-secure-store backed by Android Keystore (doc 12 §2).
 */

import * as SecureStore from "expo-secure-store";
import { getServerUrl } from "./config";

const ACCESS_TOKEN_KEY = "alibi_access_token";
const REFRESH_TOKEN_KEY = "alibi_refresh_token";
const USER_PROFILE_KEY = "alibi_user_profile";

export interface MobileUserProfile {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveUserProfile(user: MobileUserProfile): Promise<void> {
  await SecureStore.setItemAsync(USER_PROFILE_KEY, JSON.stringify(user));
}

export async function getUserProfile(): Promise<MobileUserProfile | null> {
  const raw = await SecureStore.getItemAsync(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileUserProfile;
  } catch {
    return null;
  }
}

export async function clearAuthData(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
}

export async function loginMobile(
  email: string,
  password: string,
  deviceName: string = "Android Phone"
): Promise<{ success: boolean; error?: string; user?: MobileUserProfile }> {
  const baseUrl = getServerUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        device: {
          name: deviceName,
          platform: "android",
          app_version: "0.1.0",
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data?.detail || "Authentication failed" };
    }

    await saveTokens(data.access_token, data.refresh_token);
    if (data.user) {
      await saveUserProfile(data.user);
    }
    return { success: true, user: data.user };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || "Network request failed" };
  }
}

export async function getSetupStatus(): Promise<boolean | null> {
  const baseUrl = getServerUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/setup-status`);
    if (!response.ok) return null;
    const data = (await response.json()) as { needs_setup?: boolean };
    return data.needs_setup === true;
  } catch {
    return null;
  }
}

export async function signupMobile(
  email: string,
  password: string,
  displayName: string
): Promise<{ success: boolean; error?: string; user?: MobileUserProfile }> {
  const baseUrl = getServerUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, display_name: displayName.trim() || null }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { detail?: string };
      return { success: false, error: data.detail || "Could not create your account." };
    }
    return loginMobile(email.trim(), password);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Could not connect to ALIBI." };
  }
}

export async function refreshMobileTokens(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const baseUrl = getServerUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      await clearAuthData();
      return null;
    }

    const data = await response.json();
    await saveTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function logoutMobile(): Promise<void> {
  const token = await getAccessToken();
  const refreshToken = await getRefreshToken();
  const baseUrl = getServerUrl();

  if (token) {
    try {
      await fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Best-effort remote revocation
    }
  }

  await clearAuthData();
}

function decodeBase64(input: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let str = input.replace(/=+$/, "");
  let output = "";
  if (str.length % 4 === 1) {
    throw new Error("Invalid base64 string");
  }
  for (let bc = 0, bs = 0, buffer, idx = 0; (buffer = str.charAt(idx++)); ) {
    const charIdx = chars.indexOf(buffer);
    if (~charIdx) {
      bs = bc % 4 ? bs * 64 + charIdx : charIdx;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
      }
    }
  }
  return output;
}

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonStr = decodeBase64(base64);
    const payload = JSON.parse(jsonStr);
    if (payload.exp && Date.now() >= payload.exp * 1000 - 30000) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Ensures a valid access token is available.
 * If expired or missing, refreshes the device session. Never signs in with default credentials.
 */
export async function ensureAuthenticated(forceRefresh: boolean = false): Promise<string | null> {
  const profile = await getUserProfile();
  if (profile?.email.trim().toLowerCase() === "owner@alibi.local") {
    // Older app builds could silently create this default session. Remove it on upgrade
    // so an existing installation cannot keep sharing the server owner's account.
    await logoutMobile();
    return null;
  }

  const existingToken = await getAccessToken();
  if (existingToken && !forceRefresh && !isJwtExpired(existingToken)) {
    return existingToken;
  }

  // Refresh from the device's session even if its access token was cleared.
  if (await getRefreshToken()) {
    const refreshed = await refreshMobileTokens();
    if (refreshed) return refreshed;
  }
  return null;
}


