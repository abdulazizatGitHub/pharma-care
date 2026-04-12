import type { Medicine } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/constants";
import { getData, setData, updateData } from "./storage";
import { generateId, nowISO } from "@/lib/utils";

export function getMedicines(): Medicine[] {
  return getData<Medicine>(STORAGE_KEYS.MEDICINES);
}

export function getMedicineById(id: string): Medicine | undefined {
  return getMedicines().find((m) => m.id === id);
}

export function addMedicine(data: Omit<Medicine, "id" | "createdAt" | "updatedAt">): Medicine {
  const medicine: Medicine = {
    ...data,
    id: generateId(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  updateData<Medicine>(STORAGE_KEYS.MEDICINES, (items) => [...items, medicine]);
  return medicine;
}

export function updateMedicine(
  id: string,
  data: Partial<Omit<Medicine, "id" | "createdAt">>
): Medicine {
  let updated: Medicine | undefined;
  updateData<Medicine>(STORAGE_KEYS.MEDICINES, (items) =>
    items.map((m) => {
      if (m.id !== id) return m;
      updated = { ...m, ...data, updatedAt: nowISO() };
      return updated;
    })
  );
  if (!updated) throw new Error(`Medicine with id "${id}" not found.`);
  return updated;
}

export function deleteMedicine(id: string): void {
  updateData<Medicine>(STORAGE_KEYS.MEDICINES, (items) =>
    items.filter((m) => m.id !== id)
  );
}

/**
 * Atomically deduct stock from a medicine.
 * Throws if insufficient stock.
 */
export function deductStock(id: string, qty: number): Medicine {
  const medicine = getMedicineById(id);
  if (!medicine) throw new Error("Medicine not found.");
  if (medicine.quantity < qty) {
    throw new Error(
      `Only ${medicine.quantity} unit(s) of "${medicine.name}" left in stock.`
    );
  }
  return updateMedicine(id, { quantity: medicine.quantity - qty });
}

/**
 * Bulk upsert medicines (used by CSV import).
 * Existing medicines matched by name are updated; new ones are inserted.
 */
export function bulkSaveMedicines(
  medicines: Omit<Medicine, "id" | "createdAt" | "updatedAt">[]
): { inserted: number; updated: number } {
  const existing = getMedicines();
  const existingByName = new Map(existing.map((m) => [m.name.toLowerCase(), m]));
  let inserted = 0;
  let updated = 0;

  const result = [...existing];

  for (const data of medicines) {
    const match = existingByName.get(data.name.toLowerCase());
    if (match) {
      const idx = result.findIndex((m) => m.id === match.id);
      if (idx !== -1) {
        result[idx] = { ...match, ...data, updatedAt: nowISO() };
        updated++;
      }
    } else {
      result.push({
        ...data,
        id: generateId(),
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      inserted++;
    }
  }

  setData<Medicine>(STORAGE_KEYS.MEDICINES, result);
  return { inserted, updated };
}
