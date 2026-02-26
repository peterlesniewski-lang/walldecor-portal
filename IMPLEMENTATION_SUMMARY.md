# Implementation Summary

This document summarizes the current state of implementation for the WallDecor project, based on the codebase analysis conducted on February 24, 2026.

## 1) High-level overview

- **Framework**: Next.js 14+ (App Router) with TypeScript and Tailwind CSS.
- **Architecture**: Strong separation between Admin (`/admin`) and Partner (`/dashboard`) routes.
- **Data Fetching**: Primarily Server Components with direct database access via a custom `query` wrapper.
- **Database**: Dual-support (MySQL/SQLite) with a built-in SQL preprocessing layer for compatibility.
- **Authentication**: Next-auth integrated with role-based access control (ADMIN, STAFF, ARCHI/ARCH_I).
- **Design System**: "Stitch-inspired" dark mode aesthetic with premium gold-gradient accents and micro-animations.
- **State Management**: React Server Components handle most logic; no heavy client-side state detected for dashboards.

## 2) File changes (by folder)

### `src/`

- **Renamed & Refactored**: [proxy.ts](file:///Users/piotr/Documents/AI/Antigravity/src/proxy.ts) (formerly `middleware.ts`)
  - Activated project-wide RBAC proxy.
  - Ensures redirection to `/dashboard` for unauthorized access to `/admin` or `/staff`.
- **Deleted**: `src/partner/` (redundant components).
- **Deleted**: `src/app/partner/` (redundant routes).
- **Deleted**: `src/db/` (legacy scripts).

### `src/app/`

- **Modified**: [layout.tsx](file:///Users/piotr/Documents/AI/Antigravity/src/app/layout.tsx)
  - Added `suppressHydrationWarning` to `<html>` and `<body>` to ignore hydration mismatches.

### `src/lib/`

- **Modified**: [db.ts](file:///Users/piotr/Documents/AI/Antigravity/src/lib/db.ts)
  - Implementation of `preprocessSQL` for SQLite compatibility.

## 3) Admin vs Partner isolation

- **Routing**: Explicit separation between `/admin` and `/dashboard`. Admin routes check specifically for `ADMIN` or `STAFF` roles via `proxy.ts`.
- **Component Separation**: Distinct directory (`src/admin/components`) ensures that admin elements are isolated.
- **Redundancy Removal**: The legacy `/partner` route and components have been removed in favor of the canonical `/dashboard` path.

## 4) API contracts

*Note: Dashboard data is currently fetched directly in Server Components, not via standalone API endpoints. Below are the data structures used.*

### Admin Dashboard (Computed in Page)

- `turnover12m`: Sum of `amount_net` for `PRODUCT` items in the last 12 months.
- `totalEarnedCommission`: Sum of commissions with 'EARNED' status.
- `walletStats`: Total available balance + tokens expiring in 30 days.
- `tierCounts`: Distribution of partners across Silver, Gold, Platinum.

### Partner Dashboard (via `getArchitectStats`)

- `earnedCommission`: Total available for payout.
- `cashbackBalance`: Current wallet balance.
- `turnover`: Total turnover in last 12 months.
- `tier`: Current loyalty level.

## 5) Database/SQL compatibility layer

- **`preprocessSQL` rules**:
  - `NOW()` -> `datetime('now', 'localtime')`
  - `DATE_SUB(..., INTERVAL X UNIT)` -> `datetime(..., '-X unit')`
  - `DATE_ADD(..., INTERVAL X UNIT)` -> `datetime(..., '+X unit')`
- **Execution**: Runs automatically if `DB_TYPE === 'sqlite'`.
- **Limitations**: Regex-based; handles common patterns but may fail on highly complex nested intervals.

## 6) UI changes

- **Admin dashboard**:
  - Implemented KPI grid (Turnover, Payouts forecast, Wallet totals, Partner counts).
  - Implemented Project Pipeline list (New vs Recycling).
  - Implemented Operational Alerts (Brak Opiekuna, Stale Projects).
  - Implemented Top Partner Wallets list.
- **Partner dashboard**:
  - Main turnover card with gold styling.
  - Sub-stats for available payouts and wallet balance.
  - Circular progress bar for Cashback validity.

## 7) Missing items vs spec

- **Admin Dashboard**:
  - **[RESOLVED]** Detailed activity feed/audit log.
  - **[RESOLVED]** Advanced pipeline filters and pagination.
  - **[RESOLVED]** Batch payout processing UI and API.
  - **[RESOLVED]** Project details page with item editing/addition.
  - **[NEW]** Payout Forecast drilldown (UI interactivity).
  - **[NEW]** Individual Payout Request management (Reject/Hold).
  - **[NEW]** Cashback Manager utility for manual recalibrations.
- **Partner Dashboard**:
  - **[RESOLVED]** Detailed project history/pipeline on main page.
  - **[RESOLVED]** Payout eligibility/request flow UI.
  - **[NEW]** Profile settings modal functionality.

## 10) Business Logic: Cashback Engine

- **Trigger**: Automatic calculation of 2% commission (Cashback) and defined architect commission when project status is set to `ZAKOŃCZONY`.
- **Exclusion**: `INSTALLATION` type items are strictly excluded from calculation.
- **FIFO Validity**: Cashback tokens are valid for 12 months. Balance logic automatically excludes tokens where `expires_at < now`.
- **Spending**: `spendCashback` utility (FIFO) implemented in `src/lib/cashback.ts`.
- **Payouts**: Functional `requestPayout` server action for commissions >= 300 PLN.

## 8) How to verify (step-by-step)

1. **Admin Review**: Navigate to `/admin/dashboard`.
   - Verify KPI counts match the database (e.g., check `wallet_transactions` table vs "Zobowiązania Portfela").
   - Ensure the sidebar is the specific `AdminSidebar`.
2. **Partner Review**: Navigate to `/dashboard`.
   - Verify circular progress shows "75%" based on current logic.
   - Check if "Dostępne do wypłaty" correctly sums 'EARNED' commissions.
3. **Database**: Switch `DB_TYPE` to 'sqlite' in `.env` and verify statistics still load correctly (testing the `preprocessSQL` layer).

## 9) Risks / edge cases

- **Date Range Filters**: The `DATE_SUB` conversion is sensitive to whitespace; use standard spacing in queries.
- **Cashback Expiry**: Calculated using `expires_at > NOW()`. If server time and database time mismatch, calculations may be off.
- **Role Redirects**: Ensure `next-auth` session properly reflects user roles after registration, as layouts rely heavily on `session.user.role`.
