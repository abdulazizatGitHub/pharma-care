"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CheckCircle,
  Printer,
  RefreshCcw,
  User,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useMedicines } from "@/hooks/useMedicines";
import { useSales } from "@/hooks/useSales";
import { formatCurrency, formatDatetime, isLowStock, clamp } from "@/lib/utils";
import type { CartItem, SaleRecord } from "@/lib/types";

export default function POSPage() {
  const { medicines, refresh: refreshMeds } = useMedicines();
  const { completeSale } = useSales();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const matchedMeds = useMemo(() => {
    let list = medicines.filter((m) => m.quantity > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.genericName?.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 16); // Show top 16 matches in grid
  }, [medicines, search]);

  function addToCart(medId: string) {
    const med = medicines.find((m) => m.id === medId);
    if (!med) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.medicine.id === medId);
      if (existing) {
        return prev.map((i) =>
          i.medicine.id === medId ? { ...i, quantity: clamp(i.quantity + 1, 1, med.quantity) } : i
        );
      }
      return [...prev, { medicine: med, quantity: 1 }];
    });
    setSearch("");
    searchInputRef.current?.focus();
  }

  function changeQty(medId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.medicine.id !== medId) return i;
          const newQty = clamp(i.quantity + delta, 0, i.medicine.quantity);
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(medId: string) {
    setCart((prev) => prev.filter((i) => i.medicine.id !== medId));
  }

  const subtotal = cart.reduce((sum, i) => sum + i.medicine.salePrice * i.quantity, 0);
  const discount = Number(discountInput) || 0;
  const grandTotal = Math.max(0, subtotal - discount);

  async function handleCompleteSale() {
    if (cart.length === 0) return;
    if (discount > subtotal) {
      toast("Discount cannot exceed subtotal", "error");
      return;
    }
    setCompleting(true);
    try {
      await new Promise((r) => setTimeout(r, 200));
      const sale = completeSale(cart, undefined, discount, customerName.trim() || undefined);
      toast("Sale completed successfully ✓", "success");
      setCompletedSale(sale);
      setCart([]);
      setDiscountInput("");
      setCustomerName("");
      refreshMeds();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Could not complete sale", "error");
    } finally {
      setCompleting(false);
    }
  }

  function startNewSale() {
    setCompletedSale(null);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }

  if (completedSale) {
    // ─── RECEIPT VIEW ────────────────────────────────────────────────────────────
    return (
      <div className="flex flex-col items-center py-10 print:py-0 print:block" style={{ animation: "fadeIn 0.3s ease-out" }}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-8 max-w-md w-full print:shadow-none print:border-none print:p-0 font-mono text-sm text-slate-800 mx-auto">
          {/* Header */}
          <div className="text-center mb-6 border-b border-dashed border-slate-300 pb-6 print:border-black">
            <h1 className="text-xl font-bold uppercase tracking-widest mb-1">PharmaCare</h1>
            <p className="text-xs text-slate-500 print:text-black">123 Health Ave, Medical City</p>
            <p className="text-xs text-slate-500 print:text-black">Tel: (555) 123-4567</p>
          </div>

          {/* Info */}
          <div className="mb-6 space-y-1">
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{formatDatetime(completedSale.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Receipt #:</span>
              <span>{completedSale.id.split("-")[1].toUpperCase()}</span>
            </div>
            {completedSale.customerName && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span>{completedSale.customerName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>Admin</span>
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-b border-dashed border-slate-300 py-3 mb-6 print:border-black">
            <div className="flex justify-between font-bold text-xs mb-2">
              <span className="w-1/2">Item</span>
              <span className="w-1/4 text-center">Qty</span>
              <span className="w-1/4 text-right">Total</span>
            </div>
            <div className="space-y-3">
              {completedSale.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <div className="w-1/2 pr-2">
                    <p className="truncate">{item.medicineName}</p>
                    <p className="text-xs text-slate-500 print:text-black">@{formatCurrency(item.unitPrice)}</p>
                  </div>
                  <span className="w-1/4 text-center my-auto">{item.quantity}</span>
                  <span className="w-1/4 text-right my-auto">{formatCurrency(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-2 mb-8">
            <div className="flex justify-between text-slate-600 print:text-black">
              <span>Subtotal</span>
              <span>{formatCurrency(completedSale.subtotal || completedSale.totalAmount)}</span>
            </div>
            {(completedSale.discount ?? 0) > 0 && (
              <div className="flex justify-between text-slate-600 print:text-black">
                <span>Discount</span>
                <span>- {formatCurrency(completedSale.discount!)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200 print:border-black">
              <span>Grand Total</span>
              <span>{formatCurrency(completedSale.totalAmount)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-slate-500 print:text-black">
            <p>Thank you for choosing PharmaCare!</p>
            <p className="mt-1">Please keep this receipt for your records.</p>
          </div>
        </div>

        {/* Actions (Hidden on Print) */}
        <div className="mt-8 flex gap-4 print:hidden">
          <Button variant="secondary" size="lg" icon={<Printer size={18} />} onClick={() => window.print()}>
            Print Receipt
          </Button>
          <Button size="lg" icon={<RefreshCcw size={18} />} onClick={startNewSale}>
            New Sale
          </Button>
        </div>
      </div>
    );
  }

  // ─── POS VIEW ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full print:hidden" style={{ animation: "fadeIn 0.2s ease-out" }}>
      {/* ─── Left: POS Search & Catalog ────────────── */}
      <div className="flex flex-col gap-4 w-full lg:w-2/3 h-full">
        {/* Large Search Bar */}
        <div className="relative shrink-0">
          <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Scan barcode or search medicine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-16 w-full rounded-2xl border-2 border-indigo-100 pl-12 pr-4 text-lg placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 shadow-sm transition-all bg-white"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Catalog Grid */}
        <div className="flex-1 overflow-y-auto">
          {matchedMeds.length === 0 ? (
            <EmptyState
              icon={<Search size={32} />}
              title="No medicines found"
              description={search ? `No items match "${search}"` : "Search for a medicine to begin"}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-2 pb-6">
              {matchedMeds.map((med) => {
                const isLow = isLowStock(med.quantity);
                return (
                  <button
                    key={med.id}
                    onClick={() => addToCart(med.id)}
                    className="flex flex-col text-left bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <div className="flex-1 min-w-0 w-full">
                      <p className="font-bold text-slate-800 line-clamp-1">{med.name}</p>
                      {med.genericName && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{med.genericName}</p>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between w-full">
                      <span className="font-bold text-indigo-700">{formatCurrency(med.salePrice)}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isLow ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                        {med.quantity} left
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Right: Cart & Checkout ───────────────── */}
      <Card className="flex flex-col w-full lg:w-1/3 shrink-0 h-full !p-0 overflow-hidden shadow-xl border-slate-200">
        <div className="bg-slate-800 px-5 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-indigo-400" />
            <h2 className="font-bold text-lg tracking-wide">Current Order</h2>
          </div>
          <span className="bg-indigo-600 text-white font-bold text-sm px-2.5 py-1 rounded-full">
            {cart.reduce((s, i) => s + i.quantity, 0)} items
          </span>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
              <ShoppingCart size={40} className="opacity-20" />
              <p className="text-sm font-medium">Cart is empty</p>
            </div>
          ) : (
            cart.map((item) => {
              const max = item.medicine.quantity;
              const overLimit = item.quantity > max;
              return (
                <div
                  key={item.medicine.id}
                  className={`bg-white rounded-xl border p-3 flex flex-col gap-3 shadow-sm ${
                    overLimit ? "border-rose-400 bg-rose-50/50" : "border-slate-200"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-semibold text-slate-800 line-clamp-1">{item.medicine.name}</p>
                    <button
                      onClick={() => removeFromCart(item.medicine.id)}
                      className="text-slate-300 hover:text-rose-500 transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden shrink-0">
                      <button
                        onClick={() => changeQty(item.medicine.id, -1)}
                        className="w-10 h-8 bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 font-bold transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <div className="w-10 h-8 flex items-center justify-center text-sm font-bold bg-white text-slate-800 border-x border-slate-200">
                        {item.quantity}
                      </div>
                      <button
                        onClick={() => changeQty(item.medicine.id, 1)}
                        disabled={item.quantity >= max}
                        className="w-10 h-8 bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 focus:bg-slate-200 disabled:opacity-40 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-800 text-sm">
                        {formatCurrency(item.medicine.salePrice * item.quantity)}
                      </p>
                      <p className="text-[10px] uppercase font-semibold text-slate-400 mt-0.5">
                        {formatCurrency(item.medicine.salePrice)} / ea
                      </p>
                    </div>
                  </div>
                  {overLimit && (
                    <p className="text-xs text-rose-600 font-medium">⚠ Only {max} available in stock.</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Checkout Summary Footer */}
        <div className="bg-white border-t border-slate-200 p-5 shrink-0 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Customer Name (opt)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="relative">
              <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min="0"
                placeholder="Discount (PKR)"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex justify-between text-sm text-slate-500 font-medium">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 font-medium">
                <span>Discount</span>
                <span>- {formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <span className="text-slate-800 font-bold">Grand Total</span>
              <span className="text-2xl font-black text-indigo-700">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <Button
            size="lg"
            variant="success"
            className="w-full h-14 text-lg shadow-xl shadow-emerald-600/20"
            icon={<CheckCircle size={22} />}
            onClick={handleCompleteSale}
            loading={completing}
            disabled={cart.length === 0 || cart.some((i) => i.quantity > i.medicine.quantity)}
          >
            Complete Sale
          </Button>
        </div>
      </Card>
    </div>
  );
}
