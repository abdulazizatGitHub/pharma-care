"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Pill,
  ShoppingCart,
  Receipt,
  Upload,
  LogOut,
  PlusCircle,
  ChevronRight,
  BarChart,
} from "lucide-react";
import { STORAGE_KEYS } from "@/lib/constants";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Medicine Stock", icon: Pill },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart },
  { href: "/bulk-upload", label: "Bulk Upload", icon: Upload },
];

export function Sidebar({ onCloseMobile }: { onCloseMobile?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    router.push("/login");
  }

  return (
    <aside
      className={`h-full flex flex-col bg-slate-900 text-white transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      } shrink-0 shadow-2xl lg:shadow-none`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <Pill size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-white truncate">PharmaCare</p>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
        )}
        
        {/* Mobile Close Button */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1 rounded-md text-slate-400 hover:text-white transition-colors ml-auto shrink-0"
          aria-label="Close menu"
        >
          <ChevronRight size={20} className="rotate-180" />
        </button>

        {/* Desktop Collapse Button */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:block ml-auto p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronRight
            size={16}
            className={`transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 lg:py-2.5 text-sm font-medium transition-all duration-150
                    ${
                      active
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                >
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                  <div className="flex-1" onClick={onCloseMobile}></div>
                  {!collapsed && active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white/60 mx-1" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Quick Action — New Sale */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <Link
            href="/sales"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-indigo-900/30"
          >
            <PlusCircle size={18} />
            New Sale
          </Link>
        </div>
      )}

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-slate-800 pt-3">
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign Out" : undefined}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
        >
          <LogOut size={20} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
