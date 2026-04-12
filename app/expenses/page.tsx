"use client";

import React, { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useExpenses } from "@/hooks/useExpenses";
import { formatCurrency, formatDate, isSameMonth, todayISO } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { Expense, ExpenseCategory } from "@/lib/types";

// ─── Expense Form ─────────────────────────────────────────────────────────────

interface ExpenseFormProps {
  initial?: Partial<Expense>;
  onSubmit: (data: Omit<Expense, "id" | "createdAt">) => void;
  loading?: boolean;
}

function ExpenseForm({ initial, onSubmit, loading }: ExpenseFormProps) {
  const [form, setForm] = useState({
    description: initial?.description ?? "",
    amount: String(initial?.amount ?? ""),
    category: (initial?.category ?? "Other") as ExpenseCategory,
    date: initial?.date ?? todayISO(),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});

  function validate() {
    const e: typeof errors = {};
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = "Enter a valid amount";
    if (!form.date) e.date = "Date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      description: form.description.trim(),
      amount: Number(form.amount),
      category: form.category,
      date: form.date,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Description"
        placeholder="e.g. Monthly shop rent"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        error={errors.description}
        required
        autoFocus
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Amount (PKR)"
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          error={errors.amount}
          required
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          error={errors.date}
          required
        />
      </div>
      <Select
        label="Category"
        value={form.category}
        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
      >
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>
      <div className="pt-3 border-t border-slate-100">
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {initial?.id ? "Save Changes" : "Add Expense"}
        </Button>
      </div>
    </form>
  );
}

// ─── Category badge colour map ────────────────────────────────────────────────

const categoryVariant: Record<ExpenseCategory, "info" | "warning" | "danger" | "success" | "neutral" | "amber"> = {
  Rent: "info",
  Utilities: "warning",
  Salaries: "success",
  Supplies: "neutral",
  Transport: "amber",
  Maintenance: "danger",
  Other: "neutral",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { expenses, add, update, remove } = useExpenses();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const [deleteExp, setDeleteExp] = useState<Expense | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const stats = useMemo(() => {
    const now = new Date();
    const monthExp = expenses.filter((e) => isSameMonth(e.date, now));
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const monthly = monthExp.reduce((s, e) => s + e.amount, 0);
    return { total, monthly, count: expenses.length, monthCount: monthExp.length };
  }, [expenses]);

  function handleAdd(data: Omit<Expense, "id" | "createdAt">) {
    setFormLoading(true);
    setTimeout(() => {
      add(data);
      setShowAdd(false);
      setFormLoading(false);
      toast(`Expense "${data.description}" added ✓`);
    }, 200);
  }

  function handleEdit(data: Omit<Expense, "id" | "createdAt">) {
    if (!editExp) return;
    setFormLoading(true);
    setTimeout(() => {
      update(editExp.id, data);
      setEditExp(null);
      setFormLoading(false);
      toast(`Expense updated ✓`);
    }, 200);
  }

  function handleDelete() {
    if (!deleteExp) return;
    remove(deleteExp.id);
    toast(`Expense deleted`, "info");
    setDeleteExp(null);
  }

  return (
    <div className="space-y-5" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Expenses</h2>
          <p className="text-sm text-slate-500 mt-0.5">{expenses.length} total records</p>
        </div>
        <Button icon={<Plus size={18} />} size="lg" onClick={() => setShowAdd(true)}>
          Add Expense
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="This Month's Expenses"
          value={formatCurrency(stats.monthly)}
          icon={<Receipt size={22} />}
          iconBg="bg-rose-100"
          accent="text-rose-600"
          trendLabel={`${stats.monthCount} entries this month`}
          trend="neutral"
        />
        <StatCard
          label="Total All Time"
          value={formatCurrency(stats.total)}
          icon={<Receipt size={22} />}
          iconBg="bg-slate-100"
          accent="text-slate-600"
          trendLabel={`${stats.count} entries total`}
          trend="neutral"
        />
      </div>

      {/* Table */}
      <Card padding="sm">
        {expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt size={28} />}
            title="No expenses recorded yet"
            description="Track your pharmacy expenses to see profit calculations"
            action={
              <Button icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
                Add Expense
              </Button>
            }
          />
        ) : (
          <>
            {/* Mobile List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {expenses.map((exp) => (
                <div key={exp.id} className="p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-slate-800">{exp.description}</p>
                    <div className="-mt-1 flex gap-1">
                      <button onClick={() => setEditExp(exp)} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-lg"><Pencil size={15} /></button>
                      <button onClick={() => setDeleteExp(exp)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-slate-50 rounded-lg"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{formatDate(exp.date)}</span>
                    <span className="font-semibold text-rose-600">{formatCurrency(exp.amount)}</span>
                  </div>
                  <div>
                    <Badge variant={categoryVariant[exp.category]}>{exp.category}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Description</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                        {formatDate(exp.date)}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{exp.description}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={categoryVariant[exp.category]}>{exp.category}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-rose-600">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditExp(exp)}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteExp(exp)}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Modals */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Expense">
        <ExpenseForm onSubmit={handleAdd} loading={formLoading} />
      </Modal>
      <Modal open={!!editExp} onClose={() => setEditExp(null)} title="Edit Expense">
        {editExp && <ExpenseForm initial={editExp} onSubmit={handleEdit} loading={formLoading} />}
      </Modal>
      <ConfirmDialog
        open={!!deleteExp}
        onClose={() => setDeleteExp(null)}
        onConfirm={handleDelete}
        title="Delete Expense?"
        message={`Delete "${deleteExp?.description}"? This cannot be undone.`}
        confirmLabel="Yes, Delete"
      />
    </div>
  );
}
