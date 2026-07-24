# PharmaCare User Manual
### For Pharmacy Staff
*Version 1.0 — 2026*

---

# Section 1 — Getting Started

## 1.1 How to Log In

**Step 1:** Open your web browser (Chrome, Edge, or Safari all work).
**Step 2:** Go to your pharmacy's PharmaCare URL.
**Step 3:** Enter your email address and password in the login form.
**Step 4:** Click **Sign In**.

You will be taken directly to the dashboard for your role — SuperAdmin, Admin, or Pharmacist. You never need to choose which dashboard to go to; the system knows your role and takes you there automatically.

## 1.2 First Login — Changing Your Password

Every new staff account is created with a temporary password by an Admin or SuperAdmin. The **first time you log in**, the system will require you to set your own password before you can do anything else.

Password requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (for example `!`, `@`, `#`, `$`)

Once you set your own password, you will not be asked again unless a SuperAdmin resets your account.

## 1.3 Understanding Your Dashboard

Each role sees a dashboard tailored to what they actually need to act on — not a generic overview.

**Pharmacist dashboard.** Shows four quick stat cards — your own sales count for today, your current shift status (Open or No Shift), and two "Coming Soon" cards for Prescriptions and Controlled Drugs (these modules are not fully built out yet — see Section 5 for what that means). Below the stat cards, an Alerts panel shows any medicines running low on stock and any batches nearing their expiry date, pharmacy-wide — this is real, live data, not a placeholder.

**Admin dashboard.** Shows operational counters: how many low-stock alerts exist right now, how many purchase orders are currently open, how many active suppliers you work with, and how many shifts have been recorded in the last 90 days. The same Alerts panel appears below, showing low-stock and near-expiry detail.

**SuperAdmin dashboard.** Shows the broadest view: total user accounts in the system, how many pharmacists are currently active, how many purchase orders and returns are awaiting approval, and total expenses over the last 90 days. The same stock alerts panel appears here too, along with a settlement-due notice if any borrowing arrangement with another pharmacy needs attention.

## 1.4 Navigation

The sidebar on the left is how you move around PharmaCare. Hover over it to expand it and see full labels; move away and it collapses to icons only, to save screen space.

Each role has its **own dedicated sidebar** — a Pharmacist never sees Admin-only or SuperAdmin-only sections, because those routes are not available to that role at all, not just hidden.

- **Pharmacist sidebar:** Dashboard, POS, Customers *(Coming Soon)*, Shifts, Inventory, Reports (Overview), Prescriptions *(Coming Soon)*, Controlled Drugs *(Coming Soon)*.
- **Admin sidebar:** Dashboard, then grouped sections — Medicines & Stock, Suppliers, Customers (one item is Coming Soon, one is a fully working customer ledger), Accounting, Operations, Reports — followed by Staff Management.
- **SuperAdmin sidebar:** Dashboard, then grouped sections — Medicines & Stock, Suppliers, Customers, Accounting, Operations, Reports, User Management — followed by Settings and Audit Trail.

Items marked **Soon** in the sidebar are shown faded out with a small badge — you can see they exist and what's planned, but they are not clickable yet. This is intentional, not a bug: it tells you honestly what is built today versus what is coming.

---

# Section 2 — Pharmacist Guide

## 2.1 Starting Your Shift

Before you can process a single sale, you must open a shift. This is not bureaucracy for its own sake — it is what makes cash accountable. Every sale you process during an open shift is tied to that shift, so at the end of the day, the amount of cash you should have in the drawer can be checked against the amount of cash your sales actually generated.

To open a shift, go to **Shifts** in your sidebar and record your opening cash amount — the float you are starting the day with. Once your shift is open, the POS screen will allow you to complete sales. If you try to sell without an open shift, the system will block the sale.

## 2.2 Making a Sale at the POS

1. Click **POS** in the sidebar, or press the **F2** shortcut from anywhere in the app to jump straight to search.
2. Search for the medicine by name — the search box updates results as you type.
3. Select the medicine and set the quantity.
4. Add more items to the cart as needed — repeat the search for each item.
5. Apply a discount if you are authorized to (your permission tier determines what discount levels you can offer).
6. Select the payment method: **cash**, **credit** (for a registered udhaar customer), **bank transfer**, or **cheque**.
7. Enter the amount received (for cash sales, the system calculates change automatically).
8. Complete the sale.
9. Print the receipt for the customer.

### Keyboard Shortcuts Reference

PharmaCare's POS is built to be operated almost entirely from the keyboard once you know the shortcuts. This is the full, current list — 26 shortcuts across 5 categories.

**Sale actions**

| Key | Action |
|---|---|
| F3 | Compare generic medicine alternatives for the items currently in the cart |
| F4 | Hold (park) the current sale so you can start a new one |
| F5 | Retrieve a previously held sale |
| F6 | Start a return or exchange |
| F7 | Borrow a medicine from another pharmacy to fulfil this sale |
| F8 | Lend stock to another pharmacy |
| F9 | Open checkout to complete the sale |

**Navigation**

| Key | Action |
|---|---|
| F2 | Focus the medicine search bar |
| ? | Show the keyboard shortcuts help overlay |
| Esc | Close any open overlay or modal |
| ↓ | Move to the next result in the medicine search list |
| ↑ | Move to the previous result in the medicine search list |

**Cart & quantities**

| Key | Action |
|---|---|
| Tab | Move focus to the next item's quantity field |
| Shift+Tab | Move focus to the previous item's quantity field |
| Enter | In a quantity field, move to the next quantity field |
| Delete | Remove the focused cart item (or open the item selector if there are multiple items) |
| Backspace | Undo the last item removal (5-second window) |
| B | Change the batch used for the focused cart item |

**Checkout modal**

| Key | Action |
|---|---|
| Enter | Confirm and complete the sale |
| Esc | Close checkout without completing the sale |

**Generic Alternatives Wizard**

| Key | Action |
|---|---|
| 1 | Select the original medicine for all cart items |
| 2 | Select Generic Option 1 for all items |
| 3 | Select Generic Option 2 for all items |
| 4 | Select Generic Option 3 for all items |
| L | Auto-select the lowest-price option for every item |
| Enter | Apply the current selection and close the wizard |

## 2.3 Handling Credit Sales (Udhaar)

To sell on credit to a registered customer, select **credit** as the payment method at checkout and choose the customer from the customer list (the customer must already be registered in the system with a credit limit set by an Admin or SuperAdmin).

When a credit sale completes, the amount is added to that customer's outstanding balance — you will see this reflected immediately on the customer's ledger. No cash changes hands at the time of a credit sale; the customer settles later, and that payment is recorded separately (see Section 3.4 for how payments are recorded).

## 2.4 Processing a Return

When a customer brings back a medicine:

1. Press **F6** or navigate to the return flow from the POS screen.
2. Find the original sale (by receipt number or by searching recent sales).
3. Select the specific item(s) and quantity being returned, and enter a reason.
4. The system checks the return against policy: the configured return window (in days), whether the item's packaging was opened, and whether the refund amount is within the auto-approval limit.
5. If the return is within all policy limits, it completes immediately. If it falls outside any limit — for example, if it's outside the return window — it is placed into a pending-approval queue for an Admin or SuperAdmin to review before it completes.
6. Once approved, stock is automatically restored to the exact batch the item was originally sold from, and the accounting entries are reversed automatically — including a proportional reversal of any discount that applied to the original sale. You do not need to do anything accounting-related by hand.

**Important:** controlled substances can never be returned. This is a hard rule in the system, not a setting anyone can change.

## 2.5 Checking Stock and Alerts

Your dashboard's Alerts panel shows two things at a glance: medicines that have fallen below their configured reorder level, and stock batches approaching their expiry date within the configured alert window. Click through from either alert to see the full detail.

To check a specific medicine's batch detail — quantity remaining per batch, expiry dates, purchase cost — go to **Inventory** in your sidebar and search for the medicine.

## 2.6 Closing Your Shift

At the end of your working period, go to **Shifts** and close your shift. You will be asked to enter your actual closing cash count. The system compares this against the cash it expects you to have (your opening float plus all cash sales during the shift) and records any difference. This reconciliation is what makes end-of-day cash handling honest and checkable.

## 2.7 Viewing Your Sales History

Your sales history for the current session is available from the dashboard and the Shifts section. A pharmacist sees their own sales; broader sales history across all staff is an Admin/SuperAdmin capability.

---

# Section 3 — Admin Guide

## 3.1 Managing Medicines

**Adding a new medicine:** go to Medicines & Stock in your sidebar, and use the add-medicine form. You will set the name, generic name, manufacturer, drug schedule (OTC, prescription, or controlled), Maximum Retail Price, pack size, and reorder level.

**Editing medicine details:** open any existing medicine record from the same list to update its details.

**Setting reorder levels:** the reorder level determines when a medicine shows up on the low-stock alert. Set it based on how quickly that item typically sells and how long your supplier takes to restock it.

**Bulk importing medicines via CSV:** for setting up a large catalog quickly, a bulk CSV import tool is available rather than adding medicines one at a time.

## 3.2 Managing Suppliers

Add a new supplier with their contact person, phone, address, and payment terms (credit days and credit limit). Existing suppliers can be edited the same way. Only active suppliers appear when creating a new purchase order.

## 3.3 Purchase Orders

**Creating a purchase order:** select the supplier, add the medicines and quantities you're ordering, and the price agreed with the supplier for each line.

**Approval workflow:** purchase orders move through a status sequence — draft, then confirmed, then (on receipt) partially received or received. A purchase order can also be cancelled, or closed-short if a supplier can't fulfil the remainder. Once received or cancelled, a purchase order becomes read-only.

**Receiving goods (GRN):** when the supplier delivers, record a Goods Receipt Note against the purchase order. Each item you receive is recorded with its actual batch number and expiry date — this is what creates the real, sellable stock batch in inventory.

**Partial deliveries:** if a supplier only delivers part of an order, receive exactly what arrived. The purchase order moves to "partially received" and stays open for the remainder to be received later.

**Closing a purchase order:** if a supplier will never deliver the rest, the order can be closed short with a note explaining why.

## 3.4 Managing Customers

Add credit customers with their name, phone, and a credit limit. The customer ledger (under Customers in your sidebar) shows every credit sale and every payment for that customer, in date order, with a running balance. Recording a customer payment reduces their outstanding balance immediately.

## 3.5 Expenses

Record an expense with an amount, a category (Rent, Electricity, Salaries, Maintenance, Supplier Payment, or Other), a description, and a date. Expenses are shown in a paginated list with search and filtering, and a monthly expense summary is available from the same screen. Every recorded expense automatically posts the correct accounting entry — you never touch a journal entry directly.

## 3.6 Financial Reports

All of the following are available under the Accounting section of your sidebar:

- **Balance Sheet** — assets, liabilities, and equity as of any date you choose
- **Trial Balance** — every account's total debits, total credits, and net balance for a date range, always in balance
- **Financial Summary** — revenue, cost of goods sold, and expenses for a date range
- **Cash Book** — every cash movement for a chosen day, with an opening and closing balance
- **Supplier Ledger** — every transaction with a specific supplier
- **Customer Ledger** — every transaction with a specific customer

Every report screen has a **Print** button that produces a properly formatted A4 document with your pharmacy's letterhead, and most also support CSV export for further analysis in a spreadsheet.

## 3.7 Staff Management

From Staff Management, you can view every pharmacist profile, adjust which additional permissions a specific pharmacist has (beyond their default set) or restrict specific permissions they would normally have, and reset a staff member's password. As an Admin, you can manage pharmacists only — creating or editing another Admin account is a SuperAdmin-only action.

## 3.8 Shift Monitoring

The Shifts screen under Operations shows every shift across every pharmacist, filterable by pharmacist and by date range, with pagination for browsing history.

---

# Section 4 — SuperAdmin Guide

## 4.1 System Setup

**Setting opening balances:** when the pharmacy first goes live on PharmaCare, the SuperAdmin posts a one-time opening balance entry (starting cash, starting bank balance, and the owner's equity contribution). This can only be done once — the system will not allow a second opening balance entry to be posted, to protect the integrity of the books.

**Configuring pharmacy details:** pharmacy name, address, and licence information are set from Settings and appear on every printed document.

**Setting up the print header:** upload your pharmacy's logo and configure which details appear on printed receipts and reports (logo, address, contact details, watermark).

## 4.2 User Management

Only a SuperAdmin can create new user accounts. From User Management, you create an Admin or a Pharmacist account (full name, email, and a temporary password — the new user will be forced to change it on first login), assign the role, and optionally grant that specific user extra permissions beyond their role's default set, or restrict permissions they would normally have. Deactivating a user (rather than deleting them) preserves their full history while blocking further login.

## 4.3 All Admin Features

A SuperAdmin has access to everything an Admin has, plus everything described in this section. See Section 3 above for the full detail on medicines, suppliers, purchase orders, customers, expenses, and reports — none of it is repeated here because it is identical.

## 4.4 Financial Statements

**Balance Sheet interpretation:** the Balance Sheet lists every asset (Cash, Bank, Accounts Receivable, Inventory), every liability (Accounts Payable, Borrowing Payable), and equity (Owner Equity plus the current period's Net Profit as its own line). A correctly functioning system always shows Total Assets exactly equal to Total Liabilities plus Total Equity — if it doesn't, something is genuinely wrong and should be investigated immediately.

**Trial Balance interpretation:** the Trial Balance lists every account in the chart of accounts with its total debits, total credits, and net balance for the period. Total debits must always equal total credits across the whole trial balance — this is the fundamental check that the books are in balance.

**Double-entry accounting, in plain language:** every single transaction in the pharmacy affects the books in two places at once, and those two effects always cancel each other out in size. When you sell a medicine for cash, the Cash account goes up by the sale amount, and the Sales Revenue account goes up by the same amount — one "debit," one "credit," always equal. When you buy stock from a supplier, Inventory goes up and the amount you owe that supplier (Accounts Payable) goes up by the same amount. This is why the books always balance: every action has an equal and opposite counterpart recorded automatically. You never have to understand or touch this mechanism directly — it happens the moment you complete a sale, receive stock, record a payment, or log an expense.

## 4.5 Audit Trail

The Audit Trail (under its own sidebar item) shows a record of significant system actions with filters for user, action type, affected table, and date range, along with summary statistics and an activity chart.

**Why the audit log cannot be edited or deleted:** this is deliberate and non-negotiable. An audit trail that could be altered after the fact would be worthless as a record — anyone could cover up a mistake or a fraud by simply editing the log. PharmaCare enforces this at the database level, not just in the screen you see, so it holds even against someone trying to bypass the normal interface.

## 4.6 System Settings

From Settings, a SuperAdmin configures:

- **Print settings** — logo, watermark (text or logo), header and footer options, and what appears on every page versus the first page only
- **Return policy** — the return window in days, the auto-approval refund limit, and whether opened packaging is eligible for return
- **Discount policy** — special discount tiers and which staff members are authorized for which tier
- **Session timeout** — how long an idle session stays logged in before requiring re-authentication

---

# Section 5 — Common Questions

**Q: What happens if I make a mistake in a sale?**
If the sale hasn't been completed yet, you can correct the cart before checkout. If it has already been completed and the customer is still present, process it as a return and re-ring the sale correctly. Sales cannot be silently edited after the fact — that's by design, to keep the sales record trustworthy.

**Q: Can I delete a sale?**
No. PharmaCare never hard-deletes financial records. A completed sale stays in the system permanently. If a sale needs to be undone, it's undone through the return process, which creates its own reversing entry rather than erasing the original.

**Q: What is a journal entry?**
A journal entry is the underlying accounting record of a transaction — it records which accounts were affected and by how much, always in matched (debit/credit) pairs that total to zero net effect. You will rarely, if ever, need to look at one directly; they are created automatically behind every sale, purchase, payment, expense, and return.

**Q: Why does my Financial Summary show a different revenue number than my sales total?**
This is a known, documented quirk in the current version of one specific report (the Financial Summary screen), not an error in your sales data. When a discount is applied to a sale, it is recorded separately as a "contra-revenue" line (it reduces net revenue). The Financial Summary's revenue calculation currently adds this discount line back in rather than subtracting it, which can make the reported top-line revenue figure look slightly higher than the true, discount-adjusted figure. Your Balance Sheet's Net Profit figure is **not** affected by this — it is computed correctly and already accounts for discounts properly. If your Financial Summary revenue and your Balance Sheet's numbers seem to disagree slightly, trust the Balance Sheet; this is a reporting-display issue that is understood and scheduled to be corrected.

**Q: What happens when a medicine expires?**
An expired batch is automatically excluded from what a pharmacist can sell at the POS — the system will not let a pharmacist sell from a batch whose expiry date has passed. An Admin or SuperAdmin can then write off the expired stock through the inventory adjustment tools.

**Q: How do I handle a supplier returning goods, or goods I need to return to a supplier?**
Supplier-side goods returns are handled outside the standard customer-return flow described in Section 2.4, which is built for customer returns. Speak to your Admin or SuperAdmin about the correct process for your specific situation.

**Q: What is the difference between Admin and SuperAdmin?**
There is exactly one SuperAdmin per pharmacy — the owner or top-level manager. Only the SuperAdmin can create user accounts, change anyone's permissions, view the audit trail, post opening balances, and change system-wide settings. An Admin runs day-to-day operations (medicines, suppliers, purchase orders, customers, expenses, and reports) but cannot manage other users' access or touch system configuration.

**Q: Can two pharmacists use the system at the same time?**
Yes. Each pharmacist has their own login, their own shift, and their own sales are tracked separately, even while other pharmacists are actively using the system at the same time.

**Q: What happens if the internet goes down?**
PharmaCare is a cloud-based, online-first system — an internet connection is required to use it. There is currently no offline mode. If your connection drops mid-action, complete the action again once connectivity is restored; the system will not silently create duplicate records for an action that didn't successfully reach the server.

**Q: How often is my data backed up?**
Your data lives in a managed cloud database that is backed up as part of the underlying infrastructure automatically — there is no manual backup step for pharmacy staff to perform or forget.

---

# Section 6 — Keyboard Shortcuts Reference

The complete reference table (26 shortcuts across 5 categories) is reproduced here for quick lookup. See Section 2.2 for the same table split out by category with fuller descriptions.

| Key | Label | Category |
|---|---|---|
| F2 | Search Medicine | Navigation |
| F3 | Generic Alternatives | Sale |
| F4 | Hold Sale | Sale |
| F5 | Retrieve Held Sale | Sale |
| F6 | Process Return | Sale |
| F7 | Borrow Medicine | Sale |
| F8 | Lend to Pharmacy | Sale |
| F9 | Complete Sale | Sale |
| ? | Show Help | Navigation |
| Esc | Cancel / Close | Navigation |
| Tab | Next Quantity | Cart |
| Shift+Tab | Previous Quantity | Cart |
| Enter | Next Quantity (in a qty field) | Cart |
| Delete | Remove Item | Cart |
| Backspace | Undo Remove | Cart |
| B | Change Batch | Cart |
| ↓ | Next Search Result | Navigation |
| ↑ | Previous Search Result | Navigation |
| Enter | Complete Sale (in checkout) | Modal |
| Esc | Cancel (in checkout) | Modal |
| 1 | Select Original | Wizard |
| 2 | Select Option 2 | Wizard |
| 3 | Select Option 3 | Wizard |
| 4 | Select Option 4 | Wizard |
| L | Lowest Price | Wizard |
| Enter | Apply Selection (in wizard) | Wizard |

Press **?** at any time inside the POS screen to bring up this reference on screen without leaving your current sale.
