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

/**
 * Ensures a valid access token is available.
 * If no token exists, attempts auto-sign-in with the initialized owner account.
 */
export async function ensureAuthenticated(): Promise<string | null> {
  const existingToken = await getAccessToken();
  if (existingToken) return existingToken;

  try {
    const res = await loginMobile("owner@alibi.local", "AlibiOwner2026!", "Android Phone");
    if (res.success) {
      return await getAccessToken();
    }
  } catch {
    // Best-effort auto sign-in
  }
  return null;
}


