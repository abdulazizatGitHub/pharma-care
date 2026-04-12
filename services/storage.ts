/**
 * Generic localStorage service.
 * All pharmacy data goes through these functions — never raw localStorage calls in components.
 */

export function getData<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function setData<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

export function updateData<T extends { id: string }>(
  key: string,
  updater: (items: T[]) => T[]
): void {
  const current = getData<T>(key);
  setData(key, updater(current));
}

export function removeData(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}
