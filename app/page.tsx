"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getData } from "@/services/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { seedData } from "@/lib/seed";
import type { AuthSession } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    seedData();
    const session = getData<AuthSession>(STORAGE_KEYS.AUTH);
    if (session.length > 0) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return null;
}
