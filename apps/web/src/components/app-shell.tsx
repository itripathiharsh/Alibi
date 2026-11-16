"use client";
import { usePathname } from "next/navigation";
import { Navigation } from "@/components/navigation";
import { AvatarMenu } from "@/components/avatar-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/features" || pathname === "/how-it-works") return <>{children}</>;
  return <div className="min-h-screen flex flex-col">
    <Navigation />
    <header className="lg:pl-64 h-16 border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-4 lg:px-8">
      <div className="flex items-center gap-2"><img src="/icon.png" alt="ALIBI" className="w-6 h-6 object-contain lg:hidden" /><span className="font-bold text-lg text-text lg:hidden">ALIBI</span></div>
      <div className="flex items-center gap-4 ml-auto"><AvatarMenu serverStatus="Online" /></div>
    </header>
    <main className="lg:pl-64 flex-1 p-4 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">{children}</main>
  </div>;
}



