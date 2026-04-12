import { format, differenceInDays, parseISO, isValid } from "date-fns";
import { LOW_STOCK_THRESHOLD, NEAR_EXPIRY_DAYS } from "./constants";
import type { Medicine } from "./types";

// ─── ID Generation ────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return format(d, "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

export function formatDatetime(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return format(d, "dd MMM yyyy, hh:mm a");
  } catch {
    return dateStr;
  }
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function daysUntilExpiry(expiryDate: string): number {
  try {
    const expiry = parseISO(expiryDate);
    if (!isValid(expiry)) return Infinity;
    return differenceInDays(expiry, new Date());
  } catch {
    return Infinity;
  }
}

// ─── Stock / Expiry Status ────────────────────────────────────────────────────

export function isLowStock(quantity: number): boolean {
  return quantity < LOW_STOCK_THRESHOLD;
}

export function isOutOfStock(quantity: number): boolean {
  return quantity <= 0;
}

export function isExpired(expiryDate: string): boolean {
  return daysUntilExpiry(expiryDate) < 0;
}

export function isNearExpiry(expiryDate: string): boolean {
  const days = daysUntilExpiry(expiryDate);
  return days >= 0 && days <= NEAR_EXPIRY_DAYS;
}

export type StockStatus = "Out of Stock" | "Low Stock" | "In Stock";
export type ExpiryStatus = "Expired" | "Expiring Soon" | "OK";

export function getStockStatus(quantity: number): StockStatus {
  if (isOutOfStock(quantity)) return "Out of Stock";
  if (isLowStock(quantity)) return "Low Stock";
  return "In Stock";
}

export function getExpiryStatus(expiryDate: string): ExpiryStatus {
  if (isExpired(expiryDate)) return "Expired";
  if (isNearExpiry(expiryDate)) return "Expiring Soon";
  return "OK";
}

// ─── Dashboard Helpers ────────────────────────────────────────────────────────

export function isSameDay(dateStr: string, ref: Date = new Date()): boolean {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return false;
    return format(d, "yyyy-MM-dd") === format(ref, "yyyy-MM-dd");
  } catch {
    return false;
  }
}

export function isSameMonth(dateStr: string, ref: Date = new Date()): boolean {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return false;
    return (
      d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
    );
  } catch {
    return false;
  }
}

/** Returns last N days as ISO date strings, oldest first */
export function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(format(d, "yyyy-MM-dd"));
  }
  return days;
}

// ─── Medicine display name (with generic fallback) ───────────────────────────

export function medicineLabelFull(m: Medicine): string {
  return m.genericName ? `${m.name} (${m.genericName})` : m.name;
}

// ─── Clamp utility ───────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
