import type { Expense } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/constants";
import { getData, updateData } from "./storage";
import { generateId, nowISO } from "@/lib/utils";

export function getExpenses(): Expense[] {
  return getData<Expense>(STORAGE_KEYS.EXPENSES);
}

export function addExpense(data: Omit<Expense, "id" | "createdAt">): Expense {
  const expense: Expense = {
    ...data,
    id: generateId(),
    createdAt: nowISO(),
  };
  updateData<Expense>(STORAGE_KEYS.EXPENSES, (items) => [expense, ...items]);
  return expense;
}

export function updateExpense(
  id: string,
  data: Partial<Omit<Expense, "id" | "createdAt">>
): Expense {
  let updated: Expense | undefined;
  updateData<Expense>(STORAGE_KEYS.EXPENSES, (items) =>
    items.map((e) => {
      if (e.id !== id) return e;
      updated = { ...e, ...data };
      return updated;
    })
  );
  if (!updated) throw new Error(`Expense with id "${id}" not found.`);
  return updated;
}

export function deleteExpense(id: string): void {
  updateData<Expense>(STORAGE_KEYS.EXPENSES, (items) =>
    items.filter((e) => e.id !== id)
  );
}
