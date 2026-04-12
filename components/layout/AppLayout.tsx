"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { getData } from "@/services/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import type { AuthSession } from "@/lib/types";

interface AppLayoutProps {
  children: React.ReactNode;
  disableScroll?: boolean;
}

export function AppLayout({ children, disableScroll = false }: AppLayoutProps) {
  const router = useRouter();
  const [username, setUsername] = useState("Admin");
  const [checked, setChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const sessions = getData<AuthSession>(STORAGE_KEYS.AUTH);
    if (sessions.length === 0) {
      router.replace("/login");
      return;
    }
    setUsername(sessions[0].username);
    setChecked(true);
  }, [router]);

  if (!checked) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:h-auto print:overflow-visible">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform lg:static lg:block h-full transition-transform duration-300 ease-in-out print:hidden ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:overflow-visible w-full">
        <div className="print:hidden">
          <TopBar
            username={username}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
        </div>
        <main
          className={`flex-1 p-4 lg:p-6 print:p-0 print:overflow-visible min-h-0 bg-slate-50 print:bg-white w-full ${
            disableScroll ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
