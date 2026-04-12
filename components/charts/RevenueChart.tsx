"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChartDataPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface RevenueChartProps {
  data: ChartDataPoint[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entry: any) => (
          <p key={entry.name} style={{ color: entry.color }} className="font-medium">
            {entry.name === "revenue" ? "Revenue" : "Expenses"}:{" "}
            {formatCurrency(entry.value)}
          </p>
        )
      )}
    </div>
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `PKR ${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (value === "revenue" ? "Revenue" : "Expenses")}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#64748b" }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#6366f1"
          strokeWidth={2.5}
          fill="url(#revGrad)"
          dot={false}
          activeDot={{ r: 5, fill: "#6366f1" }}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke="#f43f5e"
          strokeWidth={2}
          fill="url(#expGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#f43f5e" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
