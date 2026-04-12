import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accent?: string;
}

export function StatCard({
  label,
  value,
  icon,
  iconBg = "bg-indigo-100",
  trend,
  trendLabel,
  accent = "text-indigo-600",
}: StatCardProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
      ? "text-rose-500"
      : "text-slate-400";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-start gap-4 hover:shadow-md transition-shadow duration-200">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <span className={accent}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-1 truncate">{value}</p>
        {trendLabel && trend && (
          <p className={`flex items-center gap-1 text-xs mt-1.5 font-medium ${trendColor}`}>
            <TrendIcon size={12} />
            {trendLabel}
          </p>
        )}
      </div>
    </div>
  );
}
