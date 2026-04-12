"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Bell, User } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/inventory": "Medicine Stock",
  "/sales": "Sales",
  "/expenses": "Expenses",
  "/bulk-upload": "Bulk Upload",
};

interface TopBarProps {
  username?: string;
}

export function TopBar({ username = "Admin" }: TopBarProps) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "PharmaCare";

  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="w-9 h-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center transition-colors relative"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
            <User size={15} className="text-white" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-slate-700 leading-none">{username}</p>
            <p className="text-xs text-slate-400 mt-0.5">Administrator</p>
          </div>
        </div>
      </div>
    </header>
  );
}
