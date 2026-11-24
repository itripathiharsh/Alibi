"use client";

import React, { useEffect, useState } from "react";
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Key,
  RefreshCw,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  Lock,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";

interface ProviderSetting {
  provider: string;
  enabled: boolean;
  key_last4: string | null;
  base_url: string | null;
  models: Record<string, any>;
  fallback_rank: number;
  last_test_at: string | null;
  last_test_status: string | null;
}

interface UsageSummary {
  items: Array<{
    provider: string;
    model: string;
    operation: string;
    total_calls: number;
    input_tokens: number;
    output_tokens: number;
    avg_latency_ms: number;
    error_count: number;
    estimated_cost_usd: string;
  }>;
  total_calls: number;
  total_cost_usd: string;
}

export default function AIIntelligencePage() {
  // Every call here needs the signed-in user's token; without it each request got 401
  // and the page showed nothing (logic audit B8).
  const { accessToken } = useAuth();
  const authHeaders = (json = false): Record<string, string> => ({
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  });
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"settings" | "usage">("settings");
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [serverExternalEnabled, setServerExternalEnabled] = useState(false);
  const [serverKeysAvailable, setServerKeysAvailable] = useState(false);
  const [providers, setProviders] = useState<ProviderSetting[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: string; error?: string }>>({});

  useEffect(() => {
    if (!accessToken) return;
    fetchConfigAndProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const fetchConfigAndProviders = async () => {
    setLoading(true);
    try {
      const [cfgRes, provRes, usageRes] = await Promise.all([
        fetch("/api/v1/ai/config", { headers: authHeaders() }),
        fetch("/api/v1/ai/providers", { headers: authHeaders() }),
        fetch("/api/v1/ai/usage", { headers: authHeaders() }),
      ]);

      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setMasterEnabled(Boolean(cfg.ai_external_enabled));
        setServerExternalEnabled(Boolean(cfg.server_external_enabled));
        setServerKeysAvailable(Boolean(cfg.server_keys_available));
      }
      if (provRes.ok) {
        const provs = await provRes.json();
        setProviders(provs);
      }
      if (usageRes.ok) {
        const u = await usageRes.json();
        setUsage(u);
      }
    } catch (e) {
      console.error("Failed to load AI data", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleMasterSwitch = async () => {
    const nextVal = !masterEnabled;
    try {
      const res = await fetch("/api/v1/ai/config", {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ ai_external_enabled: nextVal }),
      });
      if (res.ok) {
        setMasterEnabled(nextVal);
      }
    } catch (e) {
      console.error("Error toggling master switch", e);
    }
  };

  const handleUpdateProvider = async (provider: string, updates: Partial<ProviderSetting> & { api_key?: string }) => {
    try {
      const res = await fetch(`/api/v1/ai/providers/${provider}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setProviders((prev) => prev.map((p) => (p.provider === provider ? updated : p)));
        setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
        setProviderErrors((prev) => ({ ...prev, [provider]: "" }));
      } else {
        const problem = await res.json().catch(() => null);
        const detail = typeof problem?.detail === "string" ? problem.detail : "Could not save this setting.";
        setProviderErrors((prev) => ({ ...prev, [provider]: detail }));
      }
    } catch (e) {
      console.error("Failed to update provider", e);
    }
  };

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider);
    try {
      const res = await fetch(`/api/v1/ai/providers/${provider}/test`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [provider]: data }));
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { status: "error", error: e.message },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleClearKey = async (provider: string) => {
    try {
      const res = await fetch(`/api/v1/ai/providers/${provider}/key`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) {
        setProviders((prev) =>
          prev.map((p) => (p.provider === provider ? { ...p, key_last4: null } : p))
        );
      }
    } catch (e) {
      console.error("Failed to clear key", e);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">AI Gateway & Settings</h1>
        <p className="text-sm text-text-muted mt-1">
          Configure local and cloud AI providers, privacy routing, API credentials, and live telemetry.
        </p>
      </div>

      {/* User Cloud AI Opt-In & Server Status */}
      <div className="p-5 rounded-card bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-control mt-0.5 ${masterEnabled ? "bg-accent-emerald/10 text-accent-emerald" : "bg-accent-amber/10 text-accent-amber"}`}>
            {masterEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text text-sm">Smart sorting / cloud AI for my account</span>
              <span className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded-control ${masterEnabled ? "bg-accent-emerald/20 text-accent-emerald" : "bg-surface2 text-text-muted"}`}>
                {masterEnabled ? "Enabled (Your Account)" : "Disabled (Your Account)"}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 max-w-xl leading-relaxed">
              When enabled, your brain dumps, voice transcripts, and complex tasks can use cloud AI for smart splitting, tag inference, and time scheduling. When disabled, your account only uses deterministic parsing with zero external LLM calls.
            </p>

            {/* Read-only Server Status */}
            <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted">Server cloud AI:</span>
                <span className={`font-medium ${serverExternalEnabled ? "text-accent-emerald" : "text-text-muted"}`}>
                  {serverExternalEnabled ? "enabled" : "disabled"}
                </span>
              </div>
              <span className="text-border">•</span>
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted">Available providers on this server:</span>
                <span className="font-mono text-[11px] text-text">
                  groq, gemini, openrouter
                </span>
                {serverKeysAvailable ? (
                  <span className="text-[10px] text-accent-emerald font-medium">(keys active)</span>
                ) : (
                  <span className="text-[10px] text-text-muted">(server keys not configured)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={toggleMasterSwitch}
          className={`px-4 py-2 rounded-control text-xs font-semibold transition shrink-0 ${
            masterEnabled
              ? "bg-surface2 hover:bg-surface border border-border text-text"
              : "bg-primary text-white hover:bg-primary/90"
          }`}
        >
          {masterEnabled ? "Disable for My Account" : "Enable for My Account"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-control text-sm font-medium transition ${
            activeTab === "settings"
              ? "bg-primary text-white"
              : "text-text-muted hover:text-text hover:bg-surface2"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Providers & Fallback Chain</span>
        </button>
        <button
          onClick={() => setActiveTab("usage")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-control text-sm font-medium transition ${
            activeTab === "usage"
              ? "bg-primary text-white"
              : "text-text-muted hover:text-text hover:bg-surface2"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Usage Telemetry & Costs</span>
        </button>
      </div>

      {activeTab === "settings" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((p) => {
            const isOllama = p.provider === "ollama";
            const testResult = testResults[p.provider];

            return (
              <div key={p.provider} className="p-5 rounded-card bg-surface border border-border flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Cpu className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-text uppercase text-sm">{p.provider}</span>
                      <span className="text-[10px] bg-surface2 text-text-muted px-2 py-0.5 rounded-control font-mono">
                        Rank #{p.fallback_rank || (p.provider === "groq" ? 1 : p.provider === "gemini" ? 2 : p.provider === "openrouter" ? 3 : p.provider === "nvidia" ? 4 : 5)}
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => handleUpdateProvider(p.provider, { enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  <div className="mt-4 space-y-3">
                    {!isOllama && (
                      <div>
                        <label className="text-[11px] font-medium text-text-muted flex items-center justify-between">
                          <span>API Key (Stored Encrypted)</span>
                          {p.key_last4 && (
                            <span className="text-accent-emerald flex items-center gap-1 font-mono text-[10px]">
                              <Lock className="w-3 h-3" />
                              ••••{p.key_last4}
                            </span>
                          )}
                        </label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="password"
                            placeholder={p.key_last4 ? "••••••••••••••••" : "Paste API key"}
                            value={keyInputs[p.provider] || ""}
                            onChange={(e) => setKeyInputs({ ...keyInputs, [p.provider]: e.target.value })}
                            className="flex-1 px-3 py-1.5 rounded-control bg-surface2 border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          {keyInputs[p.provider] && (
                            <button
                              onClick={() => handleUpdateProvider(p.provider, { api_key: keyInputs[p.provider] })}
                              className="px-3 py-1.5 rounded-control bg-primary text-white text-xs font-medium hover:bg-primary/90"
                            >
                              Save
                            </button>
                          )}
                          {p.key_last4 && !keyInputs[p.provider] && (
                            <button
                              onClick={() => handleClearKey(p.provider)}
                              className="px-2.5 py-1.5 rounded-control bg-surface2 hover:bg-surface border border-border text-xs text-text-muted hover:text-accent-amber"
                              title="Clear stored key"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-medium text-text-muted">Base URL Override (Optional)</label>
                      <input
                        type="text"
                        placeholder={isOllama ? "http://localhost:11434/v1" : "Default provider endpoint"}
                        value={p.base_url || ""}
                        onChange={(e) =>
                          setProviders((prev) =>
                            prev.map((item) => (item.provider === p.provider ? { ...item, base_url: e.target.value } : item))
                          )
                        }
                        onBlur={() => handleUpdateProvider(p.provider, { base_url: p.base_url })}
                        className="w-full mt-1 px-3 py-1.5 rounded-control bg-surface2 border border-border text-xs text-text font-mono placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {providerErrors[p.provider] && (
                        <p className="mt-1 text-[11px] text-accent-amber">{providerErrors[p.provider]}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs">
                    {testResult ? (
                      testResult.status === "ok" ? (
                        <span className="flex items-center gap-1 text-accent-emerald text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-accent-amber text-[11px]" title={testResult.error}>
                          <XCircle className="w-3.5 h-3.5" /> Offline
                        </span>
                      )
                    ) : p.last_test_status ? (
                      <span className="text-[11px] text-text-muted font-mono capitalize">
                        Status: {p.last_test_status}
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-muted">Not tested</span>
                    )}
                  </div>

                  <button
                    onClick={() => handleTestConnection(p.provider)}
                    disabled={testingProvider === p.provider}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-control bg-surface2 hover:bg-surface border border-border text-xs text-text disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingProvider === p.provider ? "animate-spin" : ""}`} />
                    <span>Test</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "usage" && (
        <div className="p-6 rounded-card bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-text text-sm">Execution Telemetry (Zero Body Storage)</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Only operational metadata, token counts, and latency are logged. Prompt and response contents are never persisted.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-text-muted">Total Estimated Cost</div>
              <div className="text-lg font-bold text-text">${usage?.total_cost_usd || "0.00"}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="py-2.5 px-3 font-medium">Provider</th>
                  <th className="py-2.5 px-3 font-medium">Model</th>
                  <th className="py-2.5 px-3 font-medium">Operation</th>
                  <th className="py-2.5 px-3 font-medium text-right">Calls</th>
                  <th className="py-2.5 px-3 font-medium text-right">Tokens In/Out</th>
                  <th className="py-2.5 px-3 font-medium text-right">Avg Latency</th>
                  <th className="py-2.5 px-3 font-medium text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {usage?.items && usage.items.length > 0 ? (
                  usage.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface2/50 transition">
                      <td className="py-2.5 px-3 uppercase text-text font-sans font-medium">{item.provider}</td>
                      <td className="py-2.5 px-3 text-text-muted">{item.model}</td>
                      <td className="py-2.5 px-3 text-text-muted">{item.operation}</td>
                      <td className="py-2.5 px-3 text-right text-text">{item.total_calls}</td>
                      <td className="py-2.5 px-3 text-right text-text-muted">
                        {item.input_tokens} / {item.output_tokens}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-muted">{item.avg_latency_ms}ms</td>
                      <td className="py-2.5 px-3 text-right text-accent-emerald font-semibold">
                        ${item.estimated_cost_usd}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text-muted font-sans">
                      No external AI calls logged yet. Telemetry will appear when AI operations execute.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
