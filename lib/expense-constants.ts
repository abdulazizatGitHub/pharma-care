// Expense account labels for 6xxx accounts seeded in migration 012.
// Kept in a separate non-server file so client components can import without
// triggering the 'use server' restriction on object exports.

export const EXPENSE_ACCOUNT_LABELS: Record<string, string> = {
  '6000': 'Operating Expenses',
  '6001': 'Electricity',
  '6002': 'Rent',
  '6003': 'Salaries',
  '6004': 'Fuel & Transport',
  '6005': 'Maintenance & Repairs',
  '6006': 'Internet & Communication',
  '6007': 'Printing & Stationery',
  '6008': 'Other Expenses',
}
