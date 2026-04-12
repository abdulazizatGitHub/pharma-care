"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { getData } from "@/services/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import type { AuthSession } from "@/lib/types";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState("Admin");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const sessions = getData<AuthSession>(STORAGE_KEYS.AUTH);
    if (sessions.length === 0) { router.replace("/login"); return; }
    setUsername(sessions[0].username);
    setChecked(true);
  }, [router]);

  if (!checked) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:h-auto print:overflow-visible">
      <div className="print:hidden h-full">
        <Sidebar />
      </div>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <TopBar username={username} />
        </div>
        <main className="flex-1 overflow-hidden p-6 print:p-0 print:overflow-visible min-h-0 bg-slate-50 print:bg-white">{children}</main>
      </div>
    </div>
  );
}
