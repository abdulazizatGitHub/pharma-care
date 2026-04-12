"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { getData } from "@/services/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import type { AuthSession } from "@/lib/types";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar username={username} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
