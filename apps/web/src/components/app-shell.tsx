"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Navigation } from "@/components/navigation";
import { AvatarMenu } from "@/components/avatar-menu";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, needsSetup } = useAuth();
  const { organization, organizations, setOrganizationId, isLoading: orgLoading } = useOrganization();
  const publicRoutes = ["/", "/features", "/how-it-works", "/why-alibi", "/docs", "/login", "/signup", "/setup"];
  const isInviteRoute = pathname.startsWith("/organization-invite/");
  const isPublicRoute = publicRoutes.includes(pathname) || isInviteRoute;

  useEffect(() => {
    if (isLoading) return;
    const hasReturnTo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("returnTo");
    if (!isPublicRoute && !user) router.replace(needsSetup ? "/setup" : "/login");
    else if ((pathname === "/login" || pathname === "/signup" || pathname === "/setup") && user && !hasReturnTo) router.replace("/dashboard");
    else if (user && !publicRoutes.includes(pathname) && !isInviteRoute && !orgLoading) {
      if (!organization && pathname !== "/organization/setup") router.replace("/organization/setup");
      else if (organization?.role === "member" && pathname !== "/mobile-required" && pathname !== "/organization/sharing") router.replace("/mobile-required");
      else if (organization && ["/tasks", "/ai", "/reports"].includes(pathname)) router.replace("/dashboard");
    }
  }, [isLoading, isPublicRoute, needsSetup, organization, orgLoading, pathname, router, user]);

  if (isPublicRoute) return <>{children}</>;
  if (isLoading || !user || orgLoading) return <div className="min-h-screen bg-[#f5f7f8]" aria-busy="true" />;
  if (pathname === "/mobile-required" || pathname === "/organization/sharing" || pathname === "/organization/setup") return <>{children}</>;
  return <div className="min-h-screen flex flex-col bg-[#f5f7f8]">
    <Navigation isOpen={sidebarOpen} />
    <header className={`${sidebarOpen ? "lg:ml-64 lg:w-[calc(100%_-_16rem)]" : "lg:ml-0 lg:w-full"} box-border h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-4 lg:px-8 transition-[margin,width] duration-300`}>
      <div className="flex items-center gap-3"><img src="/icon.png" alt="ALIBI" className="w-7 h-7 object-contain lg:hidden" /><span className="font-bold text-lg text-[#092638] lg:hidden">ALIBI <span className="font-normal text-slate-400">for teams</span></span>{organizations.length > 1 && <select aria-label="Choose organization" value={organization?.id || ""} onChange={(event) => setOrganizationId(event.target.value)} className="max-w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-orange-400">{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role.replace("_", " ")}</option>)}</select>}</div>
      <div className="ml-auto flex items-center gap-3"><button type="button" onClick={() => setSidebarOpen((open) => !open)} className="hidden lg:grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700" aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebarOpen} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>{sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button><AvatarMenu /></div>
    </header>
    <main className={`${sidebarOpen ? "lg:ml-64 lg:w-[calc(100%_-_16rem)]" : "lg:ml-0 lg:w-full"} box-border min-w-0 flex-1 p-4 lg:p-8 pb-24 lg:pb-8 lg:max-w-[1600px] lg:mr-auto transition-[margin,width] duration-300`}>{children}</main>
  </div>;
}




