import React from "react";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "amber";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const styles: Record<BadgeVariant, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-rose-100 text-rose-700 border-rose-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  amber: "bg-orange-100 text-orange-700 border-orange-200",
};

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
