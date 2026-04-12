"use client";

import React, { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { useSales } from "@/hooks/useSales";
import { useExpenses } from "@/hooks/useExpenses";
import { formatCurrency, formatDatetime } from "@/lib/utils";

export default function ReportsPage() {
  const { sales } = useSales();
  const { expenses } = useExpenses();
  const [downloading, setDownloading] = useState(false);

  // Combine sales and expenses into a unified ledger
  const ledger = useMemo(() => {
    const combined = [
      ...sales.map((s) => ({
        id: s.id,
        date: s.createdAt,
        type: "Sale" as const,
        description: `Sale ${s.id.split("-")[1].toUpperCase()}`,
        amount: s.totalAmount,
      })),
      ...expenses.map((e) => ({
        id: e.id,
        date: e.date,
        type: "Expense" as const,
        description: e.description,
        amount: -e.amount,
      })),
    ];

    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, expenses]);

  const stats = useMemo(() => {
    const totalSales = sales.reduce((s, sale) => s + sale.totalAmount, 0);
    const totalExpenses = expenses.reduce((s, exp) => s + exp.amount, 0);
    return {
      revenue: totalSales,
      costs: totalExpenses,
      profit: totalSales - totalExpenses,
      transactions: ledger.length,
    };
  }, [sales, expenses, ledger.length]);

  function downloadCSV() {
    setDownloading(true);
    setTimeout(() => {
      const headers = ["Date", "Type", "Description", "Amount (PKR)"];
      const rows = ledger.map((item) => [
        item.date,
        item.type,
        `"${item.description.replace(/"/g, '""')}"`,
        Math.abs(item.amount).toString(),
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `pharmacare_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloading(false);
    }, 400);
  }

  return (
    <div className="space-y-6" style={{ animation: "fadeIn 0.3s ease-out" }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Financial Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">Unified ledger of all sales and expenses</p>
        </div>
        <Button
          icon={<Download size={18} />}
          onClick={downloadCSV}
          loading={downloading}
          disabled={ledger.length === 0}
        >
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(stats.revenue)}
          icon={<FileText size={22} />}
          iconBg="bg-emerald-100"
          accent="text-emerald-700"
          trend="up"
        />
        <StatCard
          label="Total Expenses"
          value={formatCurrency(stats.costs)}
          icon={<FileText size={22} />}
          iconBg="bg-rose-100"
          accent="text-rose-700"
          trend="down"
        />
        <StatCard
          label="Net Profit"
          value={formatCurrency(stats.profit)}
          icon={<FileText size={22} />}
          iconBg={stats.profit >= 0 ? "bg-indigo-100" : "bg-rose-100"}
          accent={stats.profit >= 0 ? "text-indigo-700" : "text-rose-700"}
          trend={stats.profit >= 0 ? "up" : "down"}
        />
      </div>

      <Card padding="sm" className="shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Description</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ledger.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                    {formatDatetime(item.date)}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={item.type === "Sale" ? "success" : "neutral"}>{item.type}</Badge>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">{item.description}</td>
                  <td className={`px-4 py-3.5 text-right font-semibold ${item.amount > 0 ? "text-emerald-600" : "text-slate-600"}`}>
                    {item.amount > 0 ? "+" : ""}{formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                    No transactions found
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
