"use client";

import React, { useState } from "react";
import { User, Settings, Moon, Sun, Database, Shield, X } from "lucide-react";
import { useTheme } from "./theme-provider";

export function AvatarMenu({ serverStatus }: { serverStatus?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-surface2 transition border border-border"
        aria-label="User settings and account menu"
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm">
          A
        </div>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface border border-border rounded-sheet w-full max-w-md p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text p-1 rounded-control"
              aria-label="Close settings"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                A
              </div>
              <div>
                <h3 className="font-semibold text-lg text-text">ALIBI Owner</h3>
                <p className="text-xs text-text-muted">owner@alibi.local</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 rounded-full bg-success inline-block"></span>
                  <span className="text-xs text-text-muted">
                    Backend: {serverStatus || "Connected"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <h4 className="text-xs font-semibold uppercase text-text-muted mb-2 tracking-wider">
                Settings & Preferences
              </h4>

              <div className="flex items-center justify-between p-2.5 rounded-control hover:bg-surface2 cursor-pointer transition">
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text">Categories & Working Hours</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-control hover:bg-surface2 cursor-pointer transition">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text">AI Providers & Privacy</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-control hover:bg-surface2 cursor-pointer transition">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text">Backup & Offline Export</span>
                </div>
              </div>

              <div
                onClick={toggleTheme}
                className="flex items-center justify-between p-2.5 rounded-control hover:bg-surface2 cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4 text-warning" />
                  ) : (
                    <Moon className="w-4 h-4 text-primary" />
                  )}
                  <span className="text-sm text-text">Theme Appearance</span>
                </div>
                <span className="text-xs capitalize px-2 py-0.5 rounded bg-surface2 text-text-muted">
                  {theme}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AvatarMenu;

