// ─── LocalStorage Keys ────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  MEDICINES: "pharmacy_medicines",
  SALES: "pharmacy_sales",
  EXPENSES: "pharmacy_expenses",
  AUTH: "pharmacy_auth",
  SEEDED: "pharmacy_seeded",
} as const;

// ─── Business Thresholds ──────────────────────────────────────────────────────

/** Quantity below which a medicine is flagged as "Low Stock" */
export const LOW_STOCK_THRESHOLD = 10;

/** Days before expiry to flag as "Expiring Soon" */
export const NEAR_EXPIRY_DAYS = 30;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const DEMO_CREDENTIALS = {
  username: "admin",
  password: "admin123",
} as const;

// ─── Expense Categories ───────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Supplies",
  "Transport",
  "Maintenance",
  "Other",
] as const;

// ─── CSV Field Labels (plain English for non-technical users) ─────────────────

export const CSV_FIELD_LABELS: Record<string, string> = {
  name: "Medicine Name",
  genericName: "Generic Name",
  batchNumber: "Batch Number",
  expiryDate: "Expiry Date (YYYY-MM-DD)",
  quantity: "Stock Quantity",
  costPrice: "Cost Price",
  salePrice: "Sale Price",
  supplier: "Supplier Name",
};

export const CSV_REQUIRED_FIELDS = ["name", "quantity", "salePrice", "expiryDate"];
