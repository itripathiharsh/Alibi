import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Navigation } from "@/components/navigation";
import { AvatarMenu } from "@/components/avatar-menu";

export const metadata: Metadata = {
  title: "ALIBI — Personal Productivity & Work Intelligence",
  description: "Adaptive planning and productivity system for personal use.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <Navigation />

            {/* Top Bar with AvatarMenu (Settings in Avatar per AC-UI-6) */}
            <header className="lg:pl-64 h-16 border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-4 lg:px-8">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg text-text lg:hidden">ALIBI</span>
              </div>

              <div className="flex items-center gap-4 ml-auto">
                <AvatarMenu serverStatus="Online" />
              </div>
            </header>

            {/* Main view container */}
            <main className="lg:pl-64 flex-1 p-4 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

