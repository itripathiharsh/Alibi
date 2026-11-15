"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

type Tab = "account" | "devices" | "categories";

interface Device {
  id: string;
  name: string;
  platform: string;
  app_version: string | null;
  last_seen_at: string;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
  sharing_class: string;
  external_ai_allowed: boolean;
  color: string;
  position: number;
}

export default function SettingsPage() {
  const { user, accessToken, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const [statusMessage, setStatusMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Account state
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Devices state
  const [devices, setDevices] = useState<Device[]>([]);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSharing, setNewCatSharing] = useState("learning");
  const [newCatAiAllowed, setNewCatAiAllowed] = useState(false);
  const [newCatColor, setNewCatColor] = useState("#3B82F6");

  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name);
    }
  }, [user]);

  // Load devices and categories
  const loadDevices = async () => {
    if (!accessToken) return;
    const { data } = await api.GET("/api/v1/auth/devices", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data) setDevices(data as Device[]);
  };

  const loadCategories = async () => {
    if (!accessToken) return;
    const { data } = await api.GET("/api/v1/categories", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data) setCategories(data as Category[]);
  };

  useEffect(() => {
    if (activeTab === "devices") loadDevices();
    if (activeTab === "categories") loadCategories();
  }, [activeTab, accessToken]);

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setStatusMessage(null);
    try {
      const { error } = await api.PATCH("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { display_name: displayName },
      });
      if (error) throw new Error("Failed to update profile");
      setStatusMessage({ text: "Profile updated successfully." });
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message, error: true });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setStatusMessage(null);
    if (newPassword.length < 12) {
      setStatusMessage({ text: "New password must be at least 12 characters.", error: true });
      return;
    }
    try {
      const { error } = await api.POST("/api/v1/auth/change-password", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { current_password: currentPassword, new_password: newPassword },
      });
      if (error) throw new Error("Failed to change password. Check current password.");
      setStatusMessage({ text: "Password changed successfully. Please sign in again." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message, error: true });
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!accessToken) return;
    try {
      await api.DELETE("/api/v1/auth/devices/{device_id}", {
        params: { path: { device_id: deviceId } },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      loadDevices();
      setStatusMessage({ text: "Device revoked." });
    } catch {
      setStatusMessage({ text: "Failed to revoke device.", error: true });
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setStatusMessage(null);
    try {
      const { error } = await api.POST("/api/v1/categories", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          name: newCatName,
          sharing_class: newCatSharing as "professional" | "personal" | "academic" | "learning",
          external_ai_allowed: newCatAiAllowed,
          color: newCatColor,
          position: categories.length + 1,
        },
      });
      if (error) throw new Error("Failed to create category");
      setNewCatName("");
      loadCategories();
      setStatusMessage({ text: "Category created." });
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message, error: true });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!accessToken) return;
    setStatusMessage(null);
    try {
      const { error } = await api.DELETE("/api/v1/categories/{category_id}", {
        params: { path: { category_id: categoryId } },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        throw new Error((error as { detail?: string })?.detail || "Cannot delete category");
      }
      loadCategories();
      setStatusMessage({ text: "Category deleted." });
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message, error: true });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage your account, registered devices, and categories.
          </p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-sm font-medium transition"
        >
          Sign Out
        </button>
      </div>

      {statusMessage && (
        <div
          className={`mb-6 p-4 rounded-lg text-sm ${
            statusMessage.error
              ? "bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400"
              : "bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-800 mb-6">
        <button
          onClick={() => setActiveTab("account")}
          className={`py-2.5 px-4 font-medium text-sm border-b-2 transition ${
            activeTab === "account"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900"
          }`}
        >
          Account
        </button>
        <button
          onClick={() => setActiveTab("devices")}
          className={`py-2.5 px-4 font-medium text-sm border-b-2 transition ${
            activeTab === "devices"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900"
          }`}
        >
          Devices
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`py-2.5 px-4 font-medium text-sm border-b-2 transition ${
            activeTab === "categories"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900"
          }`}
        >
          Categories
        </button>
      </div>

      {/* Tab 1: Account */}
      {activeTab === "account" && (
        <div className="space-y-8">
          <form onSubmit={handleUpdateAccount} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Profile Information</h2>
            <div className="grid grid-cols-1 gap-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-100 dark:bg-gray-800/50 text-gray-500 cursor-not-allowed text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="w-max px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow transition"
              >
                Save Changes
              </button>
            </div>
          </form>

          <form onSubmit={handleChangePassword} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Change Password</h2>
            <div className="grid grid-cols-1 gap-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password (min 12 chars)</label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="w-max px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow transition"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Devices */}
      {activeTab === "devices" && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Active Devices</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {devices.map((d) => (
              <div key={d.id} className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{d.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Platform: <span className="uppercase font-semibold">{d.platform}</span> · Last seen: {new Date(d.last_seen_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeDevice(d.id)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 dark:border-red-900 rounded-md"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Categories */}
      {activeTab === "categories" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Categories</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {categories.map((c) => (
                <div key={c.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm flex items-center space-x-2">
                        <span>{c.name}</span>
                        {c.is_system && (
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold px-1.5 py-0.5 rounded">
                            SYSTEM
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Class: <span className="font-medium capitalize">{c.sharing_class}</span> · External AI: {c.external_ai_allowed ? "Enabled" : "Disabled"}
                      </div>
                    </div>
                  </div>
                  {!c.is_system ? (
                    <button
                      onClick={() => handleDeleteCategory(c.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 dark:border-red-900 rounded-md"
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium italic">Immutable</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreateCategory} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add Custom Category</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Side Hustle"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sharing Class *</label>
                <select
                  value={newCatSharing}
                  onChange={(e) => setNewCatSharing(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="professional">Professional</option>
                  <option value="academic">Academic</option>
                  <option value="personal">Personal</option>
                  <option value="learning">Learning</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Badge Color</label>
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-full h-10 p-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer"
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="aiAllowed"
                  checked={newCatAiAllowed}
                  onChange={(e) => setNewCatAiAllowed(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="aiAllowed" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Allow External AI Processing
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow transition"
            >
              Create Category
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
