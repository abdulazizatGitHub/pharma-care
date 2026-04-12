"use client";

import { useState, useCallback } from "react";
import type { SaleRecord, CartItem } from "@/lib/types";
import { getSales, createSale } from "@/services/salesService";

export function useSales() {
  const [sales, setSales] = useState<SaleRecord[]>(() => getSales());

  const refresh = useCallback(() => {
    setSales(getSales());
  }, []);

  const completeSale = useCallback(
    (
      cart: CartItem[],
      note?: string,
      discount?: number,
      customerName?: string
    ): SaleRecord => {
      const sale = createSale(cart, note, discount, customerName);
      setSales(getSales());
      return sale;
    },
    []
  );

  return { sales, refresh, completeSale };
}
