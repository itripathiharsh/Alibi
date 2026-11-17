"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  settings: Record<string, unknown>;
}

interface AuthContextType {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  needsSetup: boolean | null;
  login: (email: string, password: string, redirectTo?: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string, redirectTo?: string) => Promise<void>;
  setupOwner: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const router = useRouter();

  // Check setup status and attempt refresh on initial mount
  useEffect(() => {
    async function initAuth() {
      try {
        const { data: statusData } = await api.GET("/api/v1/auth/setup-status");
        if (statusData && statusData.needs_setup) {
          setNeedsSetup(true);
          setIsLoading(false);
          return;
        }
        setNeedsSetup(false);

        // Attempt refresh using HttpOnly cookie
        const { data: refreshData, error: refreshError } = await api.POST("/api/v1/auth/refresh", {});
        if (refreshData && !refreshError) {
          setAccessToken(refreshData.access_token);
          // Fetch current user
          const { data: meData } = await api.GET("/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${refreshData.access_token}` },
          });
          if (meData) {
            setUser(meData as UserProfile);
          }
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = async (email: string, password: string, redirectTo?: string) => {
    const { data, error } = await api.POST("/api/v1/auth/login", {
      body: {
        email,
        password,
        device: {
          name: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 50) : "Web Browser",
          platform: "web",
        },
      },
    });

    if (error || !data) {
      throw new Error((error as { detail?: string })?.detail || "Login failed");
    }

    setAccessToken(data.access_token);
    if (data.user) {
      setUser(data.user as UserProfile);
    }
    router.push(redirectTo?.startsWith("/") ? redirectTo : "/dashboard");
  };

  const setupOwner = async (email: string, password: string, displayName?: string) => {
    const { error } = await api.POST("/api/v1/auth/setup", {
      body: {
        email,
        password,
        display_name: displayName,
      },
    });

    if (error) {
      throw new Error((error as { detail?: string })?.detail || "Setup failed");
    }

    setNeedsSetup(false);
    await login(email, password);
  };

  const signup = async (email: string, password: string, displayName?: string, redirectTo?: string) => {
    const { error } = await api.POST("/api/v1/auth/signup", {
      body: {
        email,
        password,
        display_name: displayName,
      },
    });

    if (error) {
      throw new Error((error as { detail?: string })?.detail || "Could not create your account.");
    }
    await login(email, password, redirectTo);
  };

  const logout = async () => {
    try {
      if (accessToken) {
        await api.POST("/api/v1/auth/logout", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    } finally {
      setUser(null);
      setAccessToken(null);
      router.push("/login");
    }
  };

  const refreshProfile = async () => {
    if (!accessToken) return;
    const { data } = await api.GET("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data) {
      setUser(data as UserProfile);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        needsSetup,
        login,
        signup,
        setupOwner,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

