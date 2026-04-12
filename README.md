# PharmaCare — Pharmacy Management System

PharmaCare is a modern, production-grade Point of Sale (POS) and Pharmacy Management System MVP built entirely on the frontend using **Next.js 16 (App Router)**, **TypeScript**, and **Tailwind CSS v4**. It features zero-latency interactions by utilizing browser LocalStorage for data persistence, requiring no external database or backend out of the box.

## ✨ Key Features
- **Intelligent Dashboard**: Real-time sales KPIs, stock alerts, and a 7-day revenue/expense chart.
- **Lightning-Fast POS Interface**: Specialized two-column layout tailored for retail speed. Includes typeahead search, click-to-add grid, real-time stock limits, and instant checkout.
- **Integrated Billing**: Immediate generation of a printable receipt view upon checkout completion with native `@media print` styling rules.
- **Inventory Management**: Comprehensive CRUD capabilities with low stock warnings, expiry date tracking, and smart sorting/filtering.
- **Expense Tracking**: Quick logging of store expenses with auto-calculated net profit ledger in reports.
- **Enterprise UI/UX**: Designed around HCI (Human-Computer Interaction) principles—large touch targets, predictable layouts, comprehensive error handling, and robust empty states.
- **Bulk Import**: Drag-and-drop CSV uploader to map columns and initialize stock seamlessly.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.18 or later

### Local Development

1. Clone the repository
```bash
git clone https://github.com/abdulazizatGitHub/pharma-care.git
cd pharma-care
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

**Demo Credentials**: Use `admin` as the username and `admin123` as the password.

## 📦 Deployment on Vercel (Recommended)

Next.js applications are specifically optimized to be deployed to Vercel with zero configuration required.

1. Create a [Vercel](https://vercel.com/) account and connect your GitHub.
2. Select **Add New Project** and pick the `pharma-care` repository.
3. Keep the default settings (Framework Preset: Next.js).
4. Click **Deploy**.

*A `vercel.json` is included for basic explicit region configuration, but the default settings will recognize Next.js automatically.*

## 🛠️ Built With

- [Next.js](https://nextjs.org/) Component-based routing and architecture.
- [Tailwind CSS](https://tailwindcss.com/) Rapid UI styling.
- [Lucide React](https://lucide.dev/) Clean, consistent iconography.
- [Recharts](https://recharts.org/) Dynamic chart rendering.
- [Papaparse](https://www.papaparse.com/) For robust frontend bulk CSV handling.
- [Date-fns](https://date-fns.org/) Lightweight date manipulation.
