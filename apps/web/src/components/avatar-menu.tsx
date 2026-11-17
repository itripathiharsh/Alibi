"use client";

import React, { useState } from "react";
import Link from "next/link";
import { User, Settings, Moon, Sun, X } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useAuth } from "@/lib/auth-context";

export function AvatarMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const accountName = user?.display_name || user?.email || "Your ALIBI account";
  const accountInitial = accountName.charAt(0).toUpperCase();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-surface2 transition border border-border"
        aria-label="User settings and account menu"
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm">
          {accountInitial}
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
                {accountInitial}
              </div>
              <div>
                <h3 className="font-semibold text-lg text-text">{accountName}</h3>
                <p className="text-xs text-text-muted">{user?.email}</p>
                <p className="mt-1 text-xs text-text-muted">Organization workspace</p>
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <Link href="/organization/settings" onClick={() => setIsOpen(false)} className="flex items-center gap-3 p-2.5 rounded-control hover:bg-surface2 transition">
                <Settings className="w-4 h-4 text-text-muted" />
                <span className="text-sm text-text">Organization & sharing</span>
              </Link>

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

              <button
                type="button"
                onClick={() => { setIsOpen(false); void logout(); }}
                className="w-full flex items-center gap-3 p-2.5 rounded-control text-sm text-red-700 hover:bg-red-50 transition"
              >
                <User className="w-4 h-4" />
                Sign out of {user?.email || "this account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AvatarMenu;

