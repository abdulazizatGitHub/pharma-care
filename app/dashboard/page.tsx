"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Pill,
  AlertTriangle,
  ShoppingCart,
  TrendingUp,
  PackageX,
  Clock,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RevenueChart } from "@/components/charts/RevenueChart";
import { useMedicines } from "@/hooks/useMedicines";
import { useSales } from "@/hooks/useSales";
import { useExpenses } from "@/hooks/useExpenses";
import {
  formatCurrency,
  formatDate,
  isSameDay,
  isSameMonth,
  isLowStock,
  isNearExpiry,
  isExpired,
  lastNDays,
  getExpiryStatus,
  getStockStatus,
} from "@/lib/utils";
import type { ChartDataPoint } from "@/lib/types";

export default function DashboardPage() {
  const { medicines } = useMedicines();
  const { sales } = useSales();
  const { expenses } = useExpenses();

  const stats = useMemo(() => {
    const now = new Date();
    const todaySales = sales.filter((s) => isSameDay(s.createdAt, now));
    const monthSales = sales.filter((s) => isSameMonth(s.createdAt, now));
    const monthExpenses = expenses.filter((e) => isSameMonth(e.date, now));

    const todaySalesTotal = todaySales.reduce((s, r) => s + r.totalAmount, 0);
    const monthlyRevenue = monthSales.reduce((s, r) => s + r.totalAmount, 0);
    const monthlyExpenses = monthExpenses.reduce((s, r) => s + r.amount, 0);

    return {
      totalMedicines: medicines.length,
      lowStockCount: medicines.filter((m) => isLowStock(m.quantity)).length,
      expiringSoonCount: medicines.filter(
        (m) => isNearExpiry(m.expiryDate) || isExpired(m.expiryDate)
      ).length,
      todaySalesTotal,
      todaySalesCount: todaySales.length,
      monthlyRevenue,
      monthlyExpenses,
      profit: monthlyRevenue - monthlyExpenses,
    };
  }, [medicines, sales, expenses]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    const days = lastNDays(7);
    return days.map((day) => {
      const dayLabel = new Date(day).toLocaleDateString("en-PK", {
        weekday: "short",
        day: "numeric",
      });
      const revenue = sales
        .filter((s) => s.createdAt.startsWith(day))
        .reduce((sum, s) => sum + s.totalAmount, 0);
      const exp = expenses
        .filter((e) => e.date === day)
        .reduce((sum, e) => sum + e.amount, 0);
      return { date: dayLabel, revenue, expenses: exp };
    });
  }, [sales, expenses]);

  const lowStockMeds = medicines.filter((m) => isLowStock(m.quantity)).slice(0, 5);
  const expiryIssues = medicines
    .filter((m) => isNearExpiry(m.expiryDate) || isExpired(m.expiryDate))
    .slice(0, 5);

  return (
    <div className="space-y-6" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Medicines"
          value={String(stats.totalMedicines)}
          icon={Pill}
        />
        <StatCard
          label="Medicines Running Low"
          value={String(stats.lowStockCount)}
          icon={AlertTriangle}
          trend={stats.lowStockCount > 0 ? "down" : "neutral"}
          trendLabel={stats.lowStockCount > 0 ? "Needs reorder" : "All stocked"}
        />
        <StatCard
          label="Today's Sales"
          value={formatCurrency(stats.todaySalesTotal)}
          icon={ShoppingCart}
          trend="up"
          trendLabel={`${stats.todaySalesCount} transaction${stats.todaySalesCount !== 1 ? "s" : ""} today`}
        />
        <StatCard
          label="This Month's Profit"
          value={formatCurrency(stats.profit)}
          icon={TrendingUp}
          trend={stats.profit >= 0 ? "up" : "down"}
          trendLabel={`Revenue ${formatCurrency(stats.monthlyRevenue)}`}
        />
      </div>

      {/* Chart + Attention Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Sales vs Expenses — Last 7 Days</h2>
          </div>
          <RevenueChart data={chartData} />
        </Card>

        {/* Needs Attention */}
        <Card padding="sm">
          <h2 className="font-semibold text-slate-700 px-2 py-2 mb-2">⚠ Needs Attention</h2>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase px-2 mb-1 tracking-wide">
              Low Stock
            </p>
            {lowStockMeds.length === 0 ? (
              <p className="text-sm text-slate-400 px-2 py-1">✓ All medicines well stocked</p>
            ) : (
              lowStockMeds.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PackageX size={15} className="text-amber-500 shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{m.name}</span>
                  </div>
                  <Badge variant={getStockStatus(m.quantity) === "Out of Stock" ? "danger" : "warning"}>
                    {m.quantity} left
                  </Badge>
                </div>
              ))
            )}

            <div className="border-t border-slate-100 my-3" />

            <p className="text-xs font-semibold text-slate-400 uppercase px-2 mb-1 tracking-wide">
              Expiry Issues
            </p>
            {expiryIssues.length === 0 ? (
              <p className="text-sm text-slate-400 px-2 py-1">✓ No expiry issues</p>
            ) : (
              expiryIssues.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={15} className="text-rose-500 shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{m.name}</span>
                  </div>
                  <Badge variant={isExpired(m.expiryDate) ? "danger" : "amber"}>
                    {getExpiryStatus(m.expiryDate)}
                  </Badge>
                </div>
              ))
            )}

            {(lowStockMeds.length > 0 || expiryIssues.length > 0) && (
              <Link
                href="/inventory"
                className="flex items-center gap-1 text-xs text-indigo-600 font-medium px-2 pt-2 hover:underline"
              >
                View all medicines <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Sales */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Recent Sales</h2>
          <Link
            href="/sales"
            className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="md:hidden divide-y divide-slate-100">
          {sales.slice(0, 5).map((sale) => (
            <div key={sale.id} className="py-3 flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-800">
                  {formatCurrency(sale.totalAmount)}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(sale.createdAt).toLocaleString("en-PK", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-1">
                {sale.items.map((i) => `${i.medicineName} ×${i.quantity}`).join(", ")}
              </p>
            </div>
          ))}
          {sales.length === 0 && (
            <div className="py-8 text-center text-slate-400">No sales yet</div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Time</th>
                <th className="text-left py-2 pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Items</th>
                <th className="text-right py-2 pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 5).map((sale) => (
                <tr key={sale.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-3 text-slate-500">
                    {new Date(sale.createdAt).toLocaleString("en-PK", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 text-slate-700">
                    {sale.items.map((i) => `${i.medicineName} ×${i.quantity}`).join(", ")}
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-800">
                    {formatCurrency(sale.totalAmount)}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-400">
                    No sales yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
