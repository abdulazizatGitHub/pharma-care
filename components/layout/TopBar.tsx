"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Bell, User, Menu } from "lucide-react";

interface TopBarProps {
  username?: string;
  onMenuClick?: () => void;
}

export function TopBar({ username = "Admin", onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const pageTitle = pathname === "/" 
    ? "Dashboard" 
    : pathname.split("/").filter(Boolean)[0].replace("-", " ");

  return (
    <header className="h-16 px-4 lg:px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm relative z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <h1 className="text-lg lg:text-xl font-bold text-slate-800 capitalize">{pageTitle}</h1>
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
