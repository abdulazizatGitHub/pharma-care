"use client";
import { AppLayout } from "@/components/layout/AppLayout";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout disableScroll={true}>{children}</AppLayout>;
}
