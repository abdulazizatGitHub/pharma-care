"use client";

import { useState, useCallback } from "react";
import type { Medicine } from "@/lib/types";
import {
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine,
} from "@/services/medicineService";

export function useMedicines() {
  const [medicines, setMedicines] = useState<Medicine[]>(() => getMedicines());

  const refresh = useCallback(() => {
    setMedicines(getMedicines());
  }, []);

  const add = useCallback(
    (data: Omit<Medicine, "id" | "createdAt" | "updatedAt">) => {
      const m = addMedicine(data);
      setMedicines(getMedicines());
      return m;
    },
    []
  );

  const update = useCallback(
    (id: string, data: Partial<Omit<Medicine, "id" | "createdAt">>) => {
      const m = updateMedicine(id, data);
      setMedicines(getMedicines());
      return m;
    },
    []
  );

  const remove = useCallback((id: string) => {
    deleteMedicine(id);
    setMedicines(getMedicines());
  }, []);

  return { medicines, refresh, add, update, remove };
}
