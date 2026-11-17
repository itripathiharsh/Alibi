"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UsersRound, ChartNoAxesCombined, Settings2 } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/people", label: "People", icon: UsersRound },
  { href: "/insights", label: "Insights", icon: ChartNoAxesCombined },
  { href: "/organization/settings", label: "Organization", icon: Settings2 },
];

export function Navigation({ isOpen = true }: { isOpen?: boolean }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Left Rail Navigation (>= 1024px) */}
      <nav
        className={`${isOpen ? "hidden lg:flex" : "hidden"} flex-col w-64 border-r border-white/10 bg-[#092638] p-4 fixed left-0 top-0 bottom-0 z-30 transition-transform duration-300`}
        aria-label="Main Navigation"
      >
        <div className="flex items-center gap-3 mb-8 px-2 py-2">
          <img
            src="/icon.png"
            alt="ALIBI Logo"
            className="w-9 h-9 object-contain rounded-lg bg-white p-1"
          />
          <span className="font-bold text-lg text-white tracking-tight">ALIBI</span>
          <span className="text-[9px] uppercase font-bold tracking-widest px-2 py-1 rounded-full bg-white/10 text-orange-200 ml-auto">
            teams
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
                    ? "bg-white text-[#092638] shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="pt-4 border-t border-white/10 px-2 text-xs leading-5 text-slate-400">
          <span>Professional activity<br/>Shared by consent</span>
        </div>
      </nav>

      {/* Mobile Bottom Tab Bar (< 1024px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 flex items-center justify-around py-2 px-3"
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
                isActive ? "text-orange-600 font-semibold" : "text-slate-500 hover:text-slate-900"
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

