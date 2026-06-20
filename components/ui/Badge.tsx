import React from "react";
import { BADGE_COLORS } from "@/lib/design-tokens";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "amber";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  const colors = BADGE_COLORS[variant];
  return (
    <span
      className={className}
      style={{
        background: colors.bg,
        color: colors.color,
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: 500,
        padding: '2px 6px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
    </span>
  );
}
