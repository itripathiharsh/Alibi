import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";
import "./features.css";
import "./how-it-works.css";
import "./why-alibi.css";
import "./docs-page.css";
import "./auth-pages.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { OrganizationProvider } from "@/lib/organization-context";

export const metadata: Metadata = {
  title: "ALIBI — Personal Productivity & Work Intelligence",
  description: "Adaptive planning and productivity system for personal use.",
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark"><body className="antialiased">
    <ThemeProvider><AuthProvider><OrganizationProvider><AppShell>{children}</AppShell></OrganizationProvider></AuthProvider></ThemeProvider>
  </body></html>;
}



