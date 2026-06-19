# 💄 GlamTrack — Beauty Shop POS & Management System

> A full-featured, multi-tenant beauty shop management system built on the shared **fieldtrack-kenya** PocketBase backend.

---

## 🚀 What This System Does

| Module | Features |
|--------|----------|
| **Point of Sale** | Barcode/QR scanner, cart, cash/M-Pesa/card payment, change calculation, customer lookup |
| **Products** | Add/edit/delete, multi-image upload, bulk CSV import, variant SKUs, cost & selling price |
| **Inventory** | Real-time stock tracking, movements log, reorder alerts, stock-in/out/adjustment |
| **Sales** | Full sales history, receipts, void sales, eTIMS status, export |
| **Expenses** | Categorised expenses, receipt upload, salary/electricity/rent/etc, date filters |
| **Reports** | P&L Statement, Balance Sheet, Sales Report, Expense Breakdown, Stock Valuation — all exportable |
| **Customers** | Customer profiles, purchase history, loyalty points, search |
| **Settings** | Shop info, eTIMS/KRA config, staff management with role-based access |

---

## 🏗️ Multi-Tenant Architecture

This project **shares** the `fieldtrack-kenya.fly.dev` PocketBase backend but uses its **own collection namespace** (`bs_` prefix):

```
sg_* collections  →  Existing FieldTrack project
bs_* collections  →  GlamTrack beauty shop (this project)
```

Both projects use the **same `sg_admins`** collection for authentication. Each shop admin is assigned to a specific shop via `bs_shop_admins`.

---

## 📋 Quick Setup

### 1. Copy this folder to your computer

```
C:\Users\san\glamtrack\
```

### 2. Install dependencies

```powershell
cd C:\Users\san\glamtrack
npm install
```

### 3. Create `.env` file

```
VITE_PB_URL=https://fieldtrack-kenya.fly.dev
```

### 4. Import PocketBase Schema

1. Go to https://fieldtrack-kenya.fly.dev/_/
2. Log in as superadmin
3. Settings → Import Collections
4. Upload `pb-schema.json` (in this folder)
5. This creates all `bs_*` collections without affecting `sg_*` collections

### 5. Create Your First Shop

In PocketBase admin:
1. Go to `bs_shops` collection → New record
2. Fill: `name`, `slug` (e.g. `glamour-hair`), `phone`, `currency: KES`, `is_active: true`

### 6. Assign Admin to Shop

In `bs_shop_admins`:
- `shop_id` → your shop ID
- `admin_id` → your sg_admins ID  
- `role` → `owner`

### 7. Run locally

```powershell
npm run dev
# Opens on http://localhost:5174
```

### 8. Add Expense Categories (first time)

Go to Settings → Expenses Categories → click the default category buttons to add:
- Salaries, Electricity, Water, Rent, Transport, etc.

---

## 🚢 Deploy to Vercel

```powershell
cd C:\Users\san\glamtrack
git init
git add .
git commit -m "Initial GlamTrack commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/glamtrack.git
git push -u origin main
```

Then on Vercel:
1. Import the GitHub repo
2. Add environment variable: `VITE_PB_URL = https://fieldtrack-kenya.fly.dev`
3. Deploy ✅

**To update after changes:**
```powershell
git add .
git commit -m "Describe changes"
git push
# Vercel auto-redeploys
```

---

## 🔑 Barcode Scanner

The POS page works with **any USB or Bluetooth barcode scanner**. Scanners emulate keyboard input — just plug in and scan, no configuration needed. The system reads the barcode, finds the product, and adds it to the cart automatically.

---

## 🧾 eTIMS / KRA Integration

The system has eTIMS built in. To go live:

1. Register on [KRA eTIMS Portal](https://etims.kra.go.ke)
2. Get your device serial number
3. Enter PIN + Serial in **Settings → eTIMS / KRA**
4. Replace the `submitEtims()` stub in `src/pages/POSPage.jsx` with real KRA API calls

Every receipt shows "eTIMS Compliant" and the KRA reference number once live.

---

## 📊 P&L Formula

```
Revenue
− Cost of Sales (from product cost prices)
= GROSS PROFIT

Gross Profit
− Operating Expenses (salary, electricity, rent, etc.)
= NET PROFIT / (LOSS)
```

---

## 🗂️ Project Structure

```
src/
├── pages/
│   ├── LoginPage.jsx       ← Auth
│   ├── DashboardPage.jsx   ← Overview + charts
│   ├── POSPage.jsx         ← Point of Sale + scanner
│   ├── ProductsPage.jsx    ← Product management + bulk import
│   ├── InventoryPage.jsx   ← Stock levels + movements
│   ├── SalesPage.jsx       ← Sales history + receipts
│   ├── ExpensesPage.jsx    ← Expense tracking
│   ├── ReportsPage.jsx     ← P&L, Balance Sheet, Reports
│   ├── CustomersPage.jsx   ← Customer management
│   └── SettingsPage.jsx    ← Shop + eTIMS + Staff
├── components/
│   ├── Layout.jsx          ← Sidebar navigation
│   └── ReceiptModal.jsx    ← Printable eTIMS receipt
├── context/
│   └── AuthContext.jsx     ← Auth + shop state
└── lib/
    ├── pb.js               ← PocketBase client
    └── utils.js            ← Formatters, helpers
```

---

## 💅 Design

- **Rose & Gold** luxury color palette
- **Playfair Display** serif headings
- **Nunito** clean body font
- Mobile-responsive layout
- Smooth animations throughout

---

Built with ❤️ on React + Vite + PocketBase

