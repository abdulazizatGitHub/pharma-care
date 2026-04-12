"use client";

import { useState, useCallback } from "react";
import type { Expense } from "@/lib/types";
import {
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
} from "@/services/expenseService";

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() => getExpenses());

  const refresh = useCallback(() => {
    setExpenses(getExpenses());
  }, []);

  const add = useCallback((data: Omit<Expense, "id" | "createdAt">) => {
    const e = addExpense(data);
    setExpenses(getExpenses());
    return e;
  }, []);

  const update = useCallback(
    (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
      const e = updateExpense(id, data);
      setExpenses(getExpenses());
      return e;
    },
    []
  );

  const remove = useCallback((id: string) => {
    deleteExpense(id);
    setExpenses(getExpenses());
  }, []);

  return { expenses, refresh, add, update, remove };
}
