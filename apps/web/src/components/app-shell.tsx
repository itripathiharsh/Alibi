"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Navigation } from "@/components/navigation";
import { AvatarMenu } from "@/components/avatar-menu";
import { useAuth } from "@/lib/auth-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, needsSetup } = useAuth();
  const publicRoutes = ["/", "/features", "/how-it-works", "/why-alibi", "/docs", "/login", "/signup", "/setup"];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    if (isLoading) return;
    if (!isPublicRoute && !user) router.replace(needsSetup ? "/setup" : "/login");
    else if ((pathname === "/login" || pathname === "/signup" || pathname === "/setup") && user) router.replace("/dashboard");
  }, [isLoading, isPublicRoute, needsSetup, pathname, router, user]);

  if (isPublicRoute) return <>{children}</>;
  if (isLoading || !user) return <div className="min-h-screen bg-background" aria-busy="true" />;
  return <div className="min-h-screen flex flex-col">
    <Navigation />
    <header className="lg:pl-64 h-16 border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-4 lg:px-8">
      <div className="flex items-center gap-2"><img src="/icon.png" alt="ALIBI" className="w-6 h-6 object-contain lg:hidden" /><span className="font-bold text-lg text-text lg:hidden">ALIBI</span></div>
      <div className="flex items-center gap-4 ml-auto"><AvatarMenu serverStatus="Online" /></div>
    </header>
    <main className="lg:pl-64 flex-1 p-4 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">{children}</main>
  </div>;
}




