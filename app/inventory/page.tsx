"use client";

import React, { useState, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pill,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useMedicines } from "@/hooks/useMedicines";
import {
  formatCurrency,
  formatDate,
  getStockStatus,
  getExpiryStatus,
  isExpired,
  isLowStock,
} from "@/lib/utils";
import type { Medicine } from "@/lib/types";
import { todayISO } from "@/lib/utils";

// ─── Medicine Form ─────────────────────────────────────────────────────────────

interface MedicineFormProps {
  initial?: Partial<Medicine>;
  onSubmit: (data: Omit<Medicine, "id" | "createdAt" | "updatedAt">) => void;
  loading?: boolean;
}

function MedicineForm({ initial, onSubmit, loading }: MedicineFormProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    genericName: initial?.genericName ?? "",
    batchNumber: initial?.batchNumber ?? "",
    expiryDate: initial?.expiryDate ?? "",
    quantity: String(initial?.quantity ?? ""),
    costPrice: String(initial?.costPrice ?? ""),
    salePrice: String(initial?.salePrice ?? ""),
    supplier: initial?.supplier ?? "",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [showAdvanced, setShowAdvanced] = useState(!!initial?.genericName || !!initial?.batchNumber || !!initial?.supplier);

  function validate(): boolean {
    const e: Partial<typeof form> = {};
    if (!form.name.trim()) e.name = "Medicine name is required";
    if (!form.expiryDate) e.expiryDate = "Expiry date is required";
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) < 0)
      e.quantity = "Enter a valid quantity (0 or more)";
    if (!form.salePrice || isNaN(Number(form.salePrice)) || Number(form.salePrice) <= 0)
      e.salePrice = "Enter a valid sale price";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      name: form.name.trim(),
      genericName: form.genericName.trim(),
      batchNumber: form.batchNumber.trim(),
      expiryDate: form.expiryDate,
      quantity: Number(form.quantity),
      costPrice: Number(form.costPrice) || 0,
      salePrice: Number(form.salePrice),
      supplier: form.supplier.trim(),
    });
  }

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Essential fields */}
      <Input
        label="Medicine Name"
        placeholder="e.g. Panadol"
        value={form.name}
        onChange={set("name")}
        error={errors.name}
        required
        autoFocus
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Stock Quantity"
          type="number"
          min="0"
          placeholder="0"
          value={form.quantity}
          onChange={set("quantity")}
          error={errors.quantity}
          required
        />
        <Input
          label="Expiry Date"
          type="date"
          value={form.expiryDate}
          onChange={set("expiryDate")}
          error={errors.expiryDate}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Sale Price (PKR)"
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
          value={form.salePrice}
          onChange={set("salePrice")}
          error={errors.salePrice}
          required
        />
        <Input
          label="Cost Price (PKR)"
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
          value={form.costPrice}
          onChange={set("costPrice")}
          error={errors.costPrice}
        />
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:underline"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showAdvanced ? "Hide" : "Show"} more details
      </button>

      {showAdvanced && (
        <div className="space-y-4 pt-1 border-t border-slate-100">
          <Input
            label="Generic Name"
            placeholder="e.g. Paracetamol"
            value={form.genericName}
            onChange={set("genericName")}
          />
          <Input
            label="Batch Number"
            placeholder="e.g. PCM-2024-001"
            value={form.batchNumber}
            onChange={set("batchNumber")}
          />
          <Input
            label="Supplier"
            placeholder="e.g. GSK Pakistan"
            value={form.supplier}
            onChange={set("supplier")}
          />
        </div>
      )}

      <div className="pt-3 border-t border-slate-100">
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {initial ? "Save Changes" : "Add Medicine"}
        </Button>
      </div>
    </form>
  );
}

// ─── Stock & Expiry Badge helpers ─────────────────────────────────────────────

function StockBadge({ qty }: { qty: number }) {
  const status = getStockStatus(qty);
  // HCI specific: Red for low stock / out of stock
  const variant = status === "In Stock" ? "success" : "danger";
  return <Badge variant={variant}>{status}</Badge>;
}

function ExpiryBadge({ date }: { date: string }) {
  const status = getExpiryStatus(date);
  if (status === "OK") return null;
  return (
    <Badge variant={status === "Expired" ? "danger" : "amber"}>{status}</Badge>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { medicines, add, update, remove } = useMedicines();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterStock, setFilterStock] = useState("all");
  const [filterExpiry, setFilterExpiry] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [editMed, setEditMed] = useState<Medicine | null>(null);
  const [deleteMed, setDeleteMed] = useState<Medicine | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [sortField, setSortField] = useState<keyof Medicine>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    let list = [...medicines];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName?.toLowerCase().includes(q) ||
          m.supplier?.toLowerCase().includes(q)
      );
    }
    if (filterStock === "low") list = list.filter((m) => isLowStock(m.quantity));
    if (filterStock === "out") list = list.filter((m) => m.quantity === 0);
    if (filterStock === "ok") list = list.filter((m) => !isLowStock(m.quantity) && m.quantity > 0);

    if (filterExpiry === "expired") list = list.filter((m) => isExpired(m.expiryDate));
    if (filterExpiry === "expiring") list = list.filter(
      (m) => !isExpired(m.expiryDate) && getExpiryStatus(m.expiryDate) === "Expiring Soon"
    );

    list.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [medicines, search, filterStock, filterExpiry, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(field: keyof Medicine) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  }

  function SortIcon({ field }: { field: keyof Medicine }) {
    if (sortField !== field) return <ChevronDown size={12} className="text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="text-indigo-500" />
      : <ChevronDown size={12} className="text-indigo-500" />;
  }

  function handleAdd(data: Omit<Medicine, "id" | "createdAt" | "updatedAt">) {
    setFormLoading(true);
    setTimeout(() => {
      add(data);
      setShowAdd(false);
      setFormLoading(false);
      toast(`"${data.name}" added to stock ✓`);
    }, 200);
  }

  function handleEdit(data: Omit<Medicine, "id" | "createdAt" | "updatedAt">) {
    if (!editMed) return;
    setFormLoading(true);
    setTimeout(() => {
      update(editMed.id, data);
      setEditMed(null);
      setFormLoading(false);
      toast(`"${data.name}" updated ✓`);
    }, 200);
  }

  function handleDelete() {
    if (!deleteMed) return;
    remove(deleteMed.id);
    toast(`"${deleteMed.name}" removed from stock`, "info");
    setDeleteMed(null);
  }

  const thClass =
    "text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-slate-600";

  return (
    <div className="space-y-5" style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Medicine Stock</h2>
          <p className="text-sm text-slate-500 mt-0.5">{medicines.length} medicines in total</p>
        </div>
        <Button icon={<Plus size={18} />} size="lg" onClick={() => setShowAdd(true)}>
          Add Medicine
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-52">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name, generic name, or supplier…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
          />
        </div>
        <select
          value={filterStock}
          onChange={(e) => { setFilterStock(e.target.value); setPage(1); }}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Filter by stock status"
        >
          <option value="all">All Stock Levels</option>
          <option value="ok">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <select
          value={filterExpiry}
          onChange={(e) => { setFilterExpiry(e.target.value); setPage(1); }}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Filter by expiry"
        >
          <option value="all">All Expiry Dates</option>
          <option value="expiring">Expiring Soon</option>
          <option value="expired">Already Expired</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {paginated.length === 0 ? (
          <EmptyState
            icon={<Pill size={28} />}
            title={search || filterStock !== "all" || filterExpiry !== "all"
              ? "No medicines match your filters"
              : "No medicines added yet"}
            description={
              search || filterStock !== "all" || filterExpiry !== "all"
                ? "Try adjusting your filters"
                : "Click \"Add Medicine\" to add your first medicine to stock"
            }
            action={
              !search && filterStock === "all" && filterExpiry === "all" ? (
                <Button icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
                  Add Medicine
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className={thClass} onClick={() => toggleSort("name")}>
                    <span className="flex items-center gap-1">Name <SortIcon field="name" /></span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("quantity")}>
                    <span className="flex items-center gap-1">Stock <SortIcon field="quantity" /></span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("expiryDate")}>
                    <span className="flex items-center gap-1">Expiry <SortIcon field="expiryDate" /></span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("salePrice")}>
                    <span className="flex items-center gap-1">Sale Price <SortIcon field="salePrice" /></span>
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.map((med) => (
                  <tr key={med.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="font-medium text-slate-800">{med.name}</p>
                        {med.genericName && (
                          <p className="text-xs text-slate-400 mt-0.5">{med.genericName}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`font-semibold ${isLowStock(med.quantity) ? "text-amber-600" : "text-slate-700"}`}>
                        {med.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{formatDate(med.expiryDate)}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-700">
                      {formatCurrency(med.salePrice)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        <StockBadge qty={med.quantity} />
                        <ExpiryBadge date={med.expiryDate} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditMed(med)}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors"
                          title="Edit medicine"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteMed(med)}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                          title="Remove medicine"
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
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    p === page
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-3 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Medicine">
        <MedicineForm onSubmit={handleAdd} loading={formLoading} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editMed} onClose={() => setEditMed(null)} title="Edit Medicine">
        {editMed && (
          <MedicineForm initial={editMed} onSubmit={handleEdit} loading={formLoading} />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteMed}
        onClose={() => setDeleteMed(null)}
        onConfirm={handleDelete}
        title="Remove Medicine?"
        message={`Remove "${deleteMed?.name}" from stock? This cannot be undone.`}
        confirmLabel="Yes, Remove"
      />
    </div>
  );
}
