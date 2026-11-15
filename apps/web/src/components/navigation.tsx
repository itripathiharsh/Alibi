"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CheckSquare, Sparkles, FileText } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/ai", label: "AI Intelligence", icon: Sparkles },
  { href: "/reports", label: "Reports", icon: FileText },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Left Rail Navigation (>= 1024px) */}
      <nav
        className="hidden lg:flex flex-col w-64 border-r border-border bg-surface p-4 fixed left-0 top-0 bottom-0 z-30"
        aria-label="Main Navigation"
      >
        <div className="flex items-center gap-2 mb-8 px-2 py-2">
          <div className="w-8 h-8 rounded-control bg-primary flex items-center justify-center text-white font-bold text-sm tracking-wider">
            AL
          </div>
          <span className="font-bold text-lg text-text tracking-tight">ALIBI</span>
          <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-primary/10 text-primary ml-auto">
            v1
          </span>
        </div>

        <div className="space-y-1.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-medium transition",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text hover:bg-surface2"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="pt-4 border-t border-border px-2 text-xs text-text-muted">
          <span>Local-first · Private by default</span>
        </div>
      </nav>

      {/* Mobile Bottom Tab Bar (< 1024px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-border flex items-center justify-around py-2 px-3"
        aria-label="Mobile Bottom Navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex flex-col items-center gap-1 py-1 px-3 rounded-control text-[11px] font-medium transition",
                isActive ? "text-primary font-semibold" : "text-text-muted hover:text-text"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default Navigation;

