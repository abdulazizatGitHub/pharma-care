import type { SaleRecord, CartItem } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/constants";
import { getData, updateData } from "./storage";
import { deductStock } from "./medicineService";
import { generateId, nowISO } from "@/lib/utils";

export function getSales(): SaleRecord[] {
  return getData<SaleRecord>(STORAGE_KEYS.SALES);
}

/**
 * Create a sale from the current cart.
 * Atomically validates stock and deducts before persisting.
 * Throws on oversell — nothing is committed if any item fails.
 */
export function createSale(
  cart: CartItem[],
  note?: string,
  discount: number = 0,
  customerName?: string
): SaleRecord {
  if (cart.length === 0) throw new Error("Cart is empty.");

  // Validate all items first (read-only pass) before mutating anything
  for (const { medicine, quantity } of cart) {
    if (quantity <= 0) throw new Error(`Invalid quantity for "${medicine.name}".`);
    if (medicine.quantity < quantity) {
      throw new Error(
        `Only ${medicine.quantity} unit(s) of "${medicine.name}" available. Remove or reduce quantity.`
      );
    }
  }

  // Deduct stock for each item
  for (const { medicine, quantity } of cart) {
    deductStock(medicine.id, quantity);
  }

  const subtotal = cart.reduce(
    (sum, { medicine, quantity }) => sum + medicine.salePrice * quantity,
    0
  );
  
  const totalAmount = Math.max(0, subtotal - discount);

  // Build and persist the sale record
  const sale: SaleRecord = {
    id: generateId(),
    items: cart.map(({ medicine, quantity }) => ({
      medicineId: medicine.id,
      medicineName: medicine.name,
      quantity,
      unitPrice: medicine.salePrice,
      lineTotal: medicine.salePrice * quantity,
    })),
    subtotal,
    discount,
    totalAmount,
    customerName,
    note,
    createdAt: nowISO(),
  };

  updateData<SaleRecord>(STORAGE_KEYS.SALES, (items) => [sale, ...items]);
  return sale;
}
