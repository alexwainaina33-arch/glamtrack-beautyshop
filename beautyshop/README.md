# 📈 SalesTrack

### Run your business from your phone.

A mobile-first, offline-capable, multi-tenant POS and business management platform — purpose-built for small and medium businesses across East Africa. Salons, electronics shops, pharmacies, boutiques, restaurants, hardware stores, agrovets — one platform, zero laptop required.

**🔗 Live:** [getsalestrack.vercel.app](https://getsalestrack.vercel.app)

---

## The Problem

Most small business owners in Kenya and across East Africa run their entire operation from a single Android phone, on patchy mobile data, with no laptop and no dedicated POS hardware. Every mainstream POS/SaaS product on the market assumes the opposite — desktop-first, USD pricing, card-payment defaults, no WhatsApp integration. SalesTrack was built from the ground up for the reality on the ground, not adapted from a Western product.

## The Approach

- **Mobile-first, not mobile-friendly.** Every screen is designed for a phone first, not shrunk down from a desktop layout.
- **Offline-first.** Sales process normally with zero internet connection and sync automatically the moment connectivity returns.
- **WhatsApp-native.** Booking confirmations, digital receipts, low-stock alerts, review requests, renewal reminders — all delivered the way East African businesses actually communicate.
- **Installs like an app, costs nothing like one.** Progressive Web App architecture means zero app-store friction and zero install cost, with full home-screen shortcuts.

---

## ✨ Feature Highlights

### Point of Sale & Inventory
Offline-capable POS with barcode/QR scanner support (any USB or Bluetooth scanner, zero config), real-time stock tracking, product variants (size/color SKUs), supplier and funding-source tracking on every stock movement, and automatic low-stock WhatsApp alerts.

### Financial Reporting That Actually Holds Up
Full P&L, automated Balance Sheet, and Cash Flow Statement — all computed from the same underlying transaction data, so the numbers always agree with each other. Plus a **Lender Pack**: a single printable document with a 6-month revenue history, DSCR calculator, and AR aging — built so an owner can walk into a bank with real, verifiable proof of income.

### A Free Professional Website for Every Shop
Every shop gets a branded public page out of the box — hero banner, live open/closed status, photo gallery with before/after sliders, staff profiles, customer reviews with owner replies, Google Maps embed, and a downloadable price list. No web design skill, no extra cost, no separate tool.

### Public Booking, Zero Friction
Customers book appointments directly with no login, no app download — multi-service cart, staff selection, instant WhatsApp confirmation.

### Staff & Commission Management
Two clean staff models — system users with role-based access (owner/manager/cashier/viewer), and service providers who earn commission without needing a login at all. Commission calculator, payout tracking, attendance, and performance leaderboards.

### AI-Powered Insights
Daily, personalized business insights generated from a shop's own sales data — dead-hours detection, churn risk flags, business health scoring, and revenue forecasting.

### Built to Retain, Not Just Acquire
Renewal reminders, graceful read-only mode after expiry (never a hard lockout), automated referral credits, and a relentless WhatsApp-first communication layer across every feature.

---

## 🏗️ Tech Stack

```
Frontend     React 18 + Vite — Progressive Web App, offline-capable via IndexedDB
Backend      PocketBase
Hosting      Vercel (frontend + serverless functions) + Fly.io (backend)
Monitoring   Sentry
Backups      Automated, encrypted, off-site
```

Built as a true multi-tenant platform from day one — every business's data is fully isolated at both the application and database layer.

---

## 💰 Pricing

| Plan | Price (KES/month) | For |
|------|---------|-----|
| **Starter** | 2,499 | Core POS, inventory, sales, expenses, customer management, free shop website |
| **Growth** | 4,499 | + Staff & commissions, appointment booking, Smart Business Insights, Lender Pack |
| **Enterprise** | 6,499 | + Multi-branch & compliance tooling *(in active development)* |

7-day free trial. No card required to start. Yearly billing includes 2 months free.

---

## 📍 Status

SalesTrack is live in production, processing real transactions for real businesses in Kenya, with active development continuing weekly. Built and maintained independently, end to end — from database architecture to UI polish to deployment infrastructure.

---

## 🤝 Interested?

Whether you're a business owner who wants to see SalesTrack running your shop, a developer curious about the architecture, or just exploring — reach out via [WhatsApp](https://wa.me/254716555043) or visit the [live demo](https://getsalestrack.vercel.app/login).

---

<p align="center">Built in Kenya, for the businesses that keep East Africa running. 🇰🇪</p>