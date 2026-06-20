import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  loading?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  loading = false,
}: StatCardProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "#0F6E56"
      : trend === "down"
      ? "#A32D2D"
      : "#6b7280";

  return (
    <div
      style={{
        background: "#fff",
        border: "0.5px solid rgba(0,0,0,0.08)",
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      {/* Row 1: icon + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "#6b7280", flexShrink: 0, display: "inline-flex" }}>
          <Icon size={13} />
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "#6b7280",
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </span>
      </div>

      {/* Row 2: value */}
      {loading ? (
        <div
          className="animate-pulse bg-gray-100 rounded"
          style={{ height: 20, width: 96, marginTop: 6 }}
        />
      ) : (
        <p
          style={{
            fontSize: "20px",
            fontWeight: 500,
            color: "#111827",
            marginTop: 6,
          }}
        >
          {value}
        </p>
      )}

      {/* Row 3: trend */}
      {loading ? (
        <div
          className="animate-pulse bg-gray-100 rounded"
          style={{ height: 12, width: 64, marginTop: 4 }}
        />
      ) : (
        trendLabel && trend && (
          <p
            style={{
              fontSize: "11px",
              color: trendColor,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <TrendIcon size={11} />
            {trendLabel}
          </p>
        )
      )}
    </div>
  );
}
