"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "team_lead" | "member";
  status: string;
  professional_sharing_consent: boolean;
  consented_at: string | null;
}

interface OrganizationContextValue {
  organizations: Organization[];
  organization: Organization | null;
  setOrganizationId: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeId, setActiveId] = useState("");
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { ...(init?.headers || {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || `Request failed (${response.status})`);
    return body;
  }, [accessToken]);

  const refresh = useCallback(async () => {
    if (!user || !accessToken) { setOrganizations([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const next = await request("/organizations/mine") as Organization[];
      setOrganizations(next);
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("alibi.activeOrganization");
        setActiveId(next.some((item) => item.id === stored) ? stored || "" : next[0]?.id || "");
      } else setActiveId(next[0]?.id || "");
    }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load organizations."); }
    finally { setLoading(false); }
  }, [accessToken, request, user]);

  useEffect(() => { void refresh(); }, [refresh]);
  const createOrganization = async (name: string) => {
    const created = await request("/organizations", { method: "POST", body: JSON.stringify({ name }) }) as Organization;
    setOrganizationId(created.id);
    await refresh();
  };

  const setOrganizationId = (id: string) => { setActiveId(id); if (typeof window !== "undefined") window.localStorage.setItem("alibi.activeOrganization", id); };
  const selected = organizations.find((item) => item.id === activeId) || organizations[0] || null;
  return <OrganizationContext.Provider value={{ organizations, organization: selected, setOrganizationId, isLoading, error, refresh, createOrganization }}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error("useOrganization must be used inside OrganizationProvider");
  return value;
}

export async function organizationRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}), ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail || `Request failed (${response.status})`);
  return body as T;
}
