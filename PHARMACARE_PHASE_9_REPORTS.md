# PHARMACARE — PHASE 9: REPORTS & ANALYTICS
> **Version:** 1.0  
> **Scope:** Full business intelligence — sales, financial, inventory, supplier, pharmacist  
> **Access:** Screen (charts + tables) + PDF export + CSV export  
> **Role visibility:** Pharmacist sees own reports only; Admin/SuperAdmin see all

---

## 0. AGENT INSTRUCTIONS

Read this entire document before writing any code.
All report data comes from existing tables — no new business logic tables needed.
New DB functions (read-only, STABLE) will be added in migration 016.
Use Recharts for all charts (already installed).
All monetary values displayed in PKR with comma formatting: Rs 1,234.56

---

## 1. REPORT CATEGORIES

### 1.1 Sales Reports
- Daily sales summary
- Sales by pharmacist
- Item-wise sales (best sellers, slow movers)
- Sales trend (daily totals over a period)
- Payment type breakdown (cash vs credit)
- Discount analysis

### 1.2 Financial Reports  
- Profit & Loss statement
- Revenue vs Expenses comparison
- Cash flow statement (cash in vs cash out over time)
- Monthly balance summary

### 1.3 Inventory Reports
- Current stock valuation
- Stock movement report (items received vs sold)
- Low stock report
- Expiry report
- Dead stock (no movement in 30/60/90 days)

### 1.4 Procurement Reports
- Purchase order history
- Supplier-wise purchase analysis
- GRN history
- Outstanding payables by supplier

### 1.5 Customer Reports
- Outstanding udhaar (credit balances)
- Customer payment history
- Top customers by purchase value

### 1.6 Pharmacist Performance Reports
- Sales per pharmacist (count + value)
- Average sale value per pharmacist
- Shift summary per pharmacist

---

## 2. ROUTES & ACCESS

```
/superadmin/reports              → all reports, full access
/admin/reports                   → all reports except pharmacist-level detail
/pharmacist/reports              → own sales + shift reports only
```

All three routes use the same ReportsPage component.
Role and permissions determine which report tabs are visible.

---

## 3. DATE RANGE PRESETS

Every report supports these date range options:

```
Today
Yesterday  
This Week (Mon–today)
Last Week
This Month
Last Month
This Quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec)
Last Quarter
This Year
Last Year
Custom (date picker: from → to)
```

Default: This Month

---

## 4. DATABASE FUNCTIONS (migration 016)

All functions are STABLE, SECURITY DEFINER, return TABLE.

### 4.1 get_sales_summary(p_from DATE, p_to DATE, p_cashier_id UUID DEFAULT NULL)

Returns aggregated sales data for the period.
If p_cashier_id is provided, filters to that pharmacist only.

```sql
RETURNS TABLE (
  total_sales       BIGINT,        -- count of completed sales
  total_revenue     NUMERIC(15,2), -- sum of total_amount
  total_discount    NUMERIC(15,2), -- sum of discount_amount
  total_cogs        NUMERIC(15,2), -- from journal lines on 5000
  gross_profit      NUMERIC(15,2), -- revenue - cogs
  cash_sales        BIGINT,
  credit_sales      BIGINT,
  avg_sale_value    NUMERIC(15,2)
)
```

### 4.2 get_sales_by_day(p_from DATE, p_to DATE, p_cashier_id UUID DEFAULT NULL)

Returns one row per day for trend charts.

```sql
RETURNS TABLE (
  sale_date     DATE,
  sale_count    BIGINT,
  revenue       NUMERIC(15,2),
  discount      NUMERIC(15,2)
)
```

### 4.3 get_sales_by_pharmacist(p_from DATE, p_to DATE)

```sql
RETURNS TABLE (
  cashier_id    UUID,
  cashier_name  TEXT,
  sale_count    BIGINT,
  revenue       NUMERIC(15,2),
  avg_sale      NUMERIC(15,2)
)
```

### 4.4 get_item_sales(p_from DATE, p_to DATE, p_limit INT DEFAULT 20)

```sql
RETURNS TABLE (
  medicine_id   UUID,
  medicine_name TEXT,
  medicine_code TEXT,
  total_qty     BIGINT,
  total_revenue NUMERIC(15,2),
  avg_price     NUMERIC(15,2)
)
ORDER BY total_qty DESC
```

### 4.5 get_stock_valuation()

Returns current inventory value.

```sql
RETURNS TABLE (
  medicine_id     UUID,
  medicine_name   TEXT,
  medicine_code   TEXT,
  total_qty       BIGINT,
  avg_cost        NUMERIC(15,4), -- avg purchase_price across batches
  total_value     NUMERIC(15,2), -- total_qty × avg_cost
  sale_value      NUMERIC(15,2)  -- total_qty × avg sale_price
)
```

### 4.6 get_pl_statement(p_from DATE, p_to DATE)

Pulls from journal_lines grouped by account_type.

```sql
RETURNS TABLE (
  account_code  TEXT,
  account_name  TEXT,
  account_type  TEXT,
  total_amount  NUMERIC(15,2)
)
```

### 4.7 get_cash_flow(p_from DATE, p_to DATE)

Daily cash movements from journal lines on account 1000.

```sql
RETURNS TABLE (
  flow_date     DATE,
  cash_in       NUMERIC(15,2),
  cash_out      NUMERIC(15,2),
  net_flow      NUMERIC(15,2)
)
```

### 4.8 get_supplier_analysis(p_from DATE, p_to DATE)

```sql
RETURNS TABLE (
  supplier_id       UUID,
  supplier_name     TEXT,
  total_orders      BIGINT,
  total_purchased   NUMERIC(15,2),
  total_paid        NUMERIC(15,2),
  outstanding       NUMERIC(15,2)
)
```

### 4.9 get_expiry_report(p_days_ahead INT DEFAULT 90)

```sql
RETURNS TABLE (
  medicine_id   UUID,
  medicine_name TEXT,
  batch_no      TEXT,
  expiry_date   DATE,
  days_to_expiry INT,
  quantity      INTEGER,
  value         NUMERIC(15,2)
)
ORDER BY expiry_date ASC
```

### 4.10 get_dead_stock(p_days_inactive INT DEFAULT 60)

Medicines with no sales in the last N days.

```sql
RETURNS TABLE (
  medicine_id     UUID,
  medicine_name   TEXT,
  last_sale_date  DATE,
  days_inactive   INT,
  current_qty     INTEGER,
  stock_value     NUMERIC(15,2)
)
```

---

## 5. SERVER ACTIONS (app/actions/reports.ts)

```typescript
// All actions accept: dateFrom, dateTo, optional filters

getSalesSummary(dateFrom, dateTo, cashierId?)
getSalesByDay(dateFrom, dateTo, cashierId?)
getSalesByPharmacist(dateFrom, dateTo)     // superadmin/admin only
getItemSales(dateFrom, dateTo, limit?)
getStockValuation()                         // no date range
getPLStatement(dateFrom, dateTo)            // superadmin only
getCashFlow(dateFrom, dateTo)              // superadmin only
getSupplierAnalysis(dateFrom, dateTo)       // superadmin/admin
getExpiryReport(daysAhead?)
getDeadStock(daysInactive?)
getOutstandingReceivables()               // customers with credit_balance > 0
getOutstandingPayables()                  // suppliers AP balance

// Pharmacist restriction:
// If caller role === 'pharmacist':
//   getSalesSummary: force cashierId = caller's id
//   getSalesByDay: force cashierId = caller's id
//   All other actions: return { error: 'Access denied' }
```

---

## 6. UI COMPONENTS

### 6.1 Page structure

```
/superadmin/reports (or /admin/reports or /pharmacist/reports)

PageHeader: "Reports"

[Date Range Selector — full width]
  Preset buttons: Today | This Week | This Month | 
  This Quarter | This Year | Custom
  Custom: from/to date pickers

Tab navigation:
  Sales | Financial | Inventory | Procurement | 
  Customers | Pharmacist Performance

Each tab renders its own set of charts + tables.
```

### 6.2 Sales tab

```
Row 1 — Stat cards (4 across):
  Total Sales (count) | Total Revenue | 
  Gross Profit | Avg Sale Value

Row 2 — Charts (2 side by side):
  LEFT: Revenue trend line chart (by day)
  RIGHT: Payment type pie chart (cash vs credit)

Row 3 — Full width:
  Item-wise sales table:
    Medicine | Code | Qty Sold | Revenue | Avg Price
    Sortable columns, paginated
    [Export CSV] button
```

### 6.3 Financial tab (superadmin only)

```
Row 1 — P&L Summary cards:
  Revenue | COGS | Gross Profit | 
  Expenses | Net Profit

Row 2 — Charts (2 side by side):
  LEFT: Revenue vs Expenses bar chart (by month)
  RIGHT: Expense breakdown donut chart

Row 3 — P&L Statement table:
  Account | Type | Amount
  Grouped by: Revenue / COGS / Expenses
  Totals per group + grand total
  [Export PDF] [Export CSV]
```

### 6.4 Inventory tab

```
Row 1 — Stat cards:
  Total SKUs | Total Units | 
  Stock Value (cost) | Stock Value (sale)

Row 2 — Tabs within tab:
  [Stock Valuation] [Expiry Alert] [Dead Stock]

Stock Valuation table:
  Medicine | Code | Qty | Avg Cost | 
  Total Cost Value | Total Sale Value
  [Export CSV]

Expiry Alert table:
  Medicine | Batch | Expiry Date | Days Left | 
  Qty | Value
  Color coding: red <30d, amber 30-60d, yellow 60-90d
  [Export CSV]

Dead Stock table:
  Medicine | Last Sale | Days Inactive | Qty | Value
  [Export CSV]
```

### 6.5 Procurement tab (superadmin/admin)

```
Row 1 — Stat cards:
  Total POs | Total Purchased | 
  Outstanding Payables | Suppliers Used

Row 2 — Supplier analysis table:
  Supplier | Orders | Total Purchased | 
  Total Paid | Outstanding
  [View Ledger] link per row
  [Export CSV]
```

### 6.6 Customers tab (superadmin/admin)

```
Row 1 — Stat cards:
  Total Customers | Customers with Udhaar |
  Total Outstanding | Avg Balance

Table:
  Customer | Phone | Total Purchases | 
  Outstanding Balance | Last Purchase
  [View Ledger] link per row
  [Export CSV]
```

### 6.7 Pharmacist Performance tab (superadmin/admin)

```
Row 1 — Stat cards (overall):
  Active Pharmacists | Total Sales | 
  Best Performer | Avg Sales/Pharmacist

Row 2 — Bar chart: Sales by pharmacist

Row 3 — Table:
  Pharmacist | Sales Count | Total Revenue | 
  Avg Sale | Best Day
  [Export CSV]
```

### 6.8 PDF Export

Use browser print for PDF export:
- Each tab has an [Export PDF] button
- Clicking triggers window.print() on a clean 
  print-formatted version of the current report
- @media print: hide navigation, date selector, 
  show report header with pharmacy name + date range
- Print layout: A4, portrait for tables, 
  landscape for charts

### 6.9 CSV Export

For each table, [Export CSV] button:
- Converts current table data to CSV string
- Creates a Blob and triggers download
- Filename: report-type-YYYY-MM-DD.csv
- No server round-trip needed for CSV

---

## 7. COMPONENT FILE STRUCTURE

```
components/reports/
  ReportsPage.tsx           ← client orchestrator, tab manager
  DateRangeSelector.tsx     ← preset + custom date picker
  StatCard.tsx              ← reuse existing StatCard or extend
  
  tabs/
    SalesTab.tsx
    FinancialTab.tsx
    InventoryTab.tsx
    ProcurementTab.tsx
    CustomersTab.tsx
    PharmacistTab.tsx
  
  charts/
    RevenueTrendChart.tsx   ← Recharts LineChart
    PaymentTypePie.tsx      ← Recharts PieChart
    RevenueExpenseBar.tsx   ← Recharts BarChart
    ExpenseDonut.tsx        ← Recharts PieChart
    PharmacistBar.tsx       ← Recharts BarChart
  
  tables/
    ItemSalesTable.tsx
    StockValuationTable.tsx
    ExpiryTable.tsx
    DeadStockTable.tsx
    SupplierAnalysisTable.tsx
    CustomerBalanceTable.tsx
    PharmacistTable.tsx
  
  export/
    exportCSV.ts            ← utility function
    PrintWrapper.tsx        ← print-formatted layout
```

---

## 8. EXECUTION PLAN

### Phase 9A — DB functions (migration 016)
Write all 10 SQL functions.
Show SQL before running.
I run manually.
Verify each function returns data.

### Phase 9B — Server actions
Create app/actions/reports.ts
Role-based access enforcement per function.
npx tsc --noEmit

### Phase 9C — Core UI shell
DateRangeSelector component
ReportsPage with tab navigation
Stat cards per tab (loading state first)
Route pages for all 3 roles

### Phase 9D — Charts
All 5 chart components using Recharts
Wire to server actions with real data

### Phase 9E — Tables + Export
All 7 table components
CSV export utility
Print/PDF export

### Phase 9F — Final verification
npx next build
Route tests
Full test suite

---

## 9. RULES (add to CLAUDE.md)

```
## Phase 9 Rules — Reports
- All report DB functions are STABLE (read-only)
- Pharmacist can only see own data (force cashier_id filter)
- No report function modifies any data
- CSV export happens client-side (no server round-trip)
- PDF export uses window.print() with @media print CSS
- All amounts formatted: Rs X,XXX.XX
- Charts use Recharts (already installed)
- Date ranges always inclusive on both ends
- NULL purchase_price batches contribute 0 to COGS/valuation
```

---

*End of PHARMACARE_PHASE_9_REPORTS.md*