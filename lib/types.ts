// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  batchNumber: string;
  expiryDate: string; // ISO date string: YYYY-MM-DD
  quantity: number;
  costPrice: number;
  salePrice: number;
  supplier: string;
  createdAt: string; // ISO datetime
  updatedAt: string;
}

export interface SaleItem {
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SaleRecord {
  id: string;
  items: SaleItem[];
  subtotal?: number;
  discount?: number;
  totalAmount: number; // final grand total
  customerName?: string;
  createdAt: string; // ISO datetime
  note?: string;
}

export type ExpenseCategory =
  | "Rent"
  | "Utilities"
  | "Salaries"
  | "Supplies"
  | "Transport"
  | "Maintenance"
  | "Other";

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // ISO date string: YYYY-MM-DD
  createdAt: string;
}

export interface AuthSession {
  username: string;
  loggedInAt: string;
}

// ─── Cart (UI Only — never persisted) ────────────────────────────────────────

export interface CartItem {
  medicine: Medicine;
  quantity: number;
}

// ─── Bulk Upload ──────────────────────────────────────────────────────────────

export type CSVFieldKey = keyof Omit<Medicine, "id" | "createdAt" | "updatedAt">;

export interface BulkUploadRow {
  raw: Record<string, string>;
  parsed: Partial<Medicine>;
  errors: string[];
  isValid: boolean;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalMedicines: number;
  lowStockCount: number;
  expiringSoonCount: number;
  todaySalesTotal: number;
  todaySalesCount: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  profit: number;
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
}
