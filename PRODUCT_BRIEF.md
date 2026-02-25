# PRODUCT_BRIEF.md
**WallDecor Architect Partner Portal**
Version: 1.1 | Status: Active | Last updated: 2026-02-24

---

## 1. Product Purpose

The portal solves three business problems for WallDecor:

- **Architect transparency**: architects can see every project, every commission earned, and every cashback transaction without asking WallDecor staff. Full self-service visibility replaces manual reporting.
- **Loyalty via cashback**: a 2% cashback mechanism on product sales rewards architects for bringing projects to WallDecor. Accumulated funds in a wallet create a financial incentive to stay with the brand.
- **Operational efficiency**: staff manage projects, assignments, and payouts from a single admin interface. Automated tier classification, alert generation, and activity logging eliminate manual tracking work.

---

## 2. User Roles

### ARCHI (Architect / Partner)

- External user. Represents an architectural firm or individual architect.
- Can: register projects, view own commissions, view own wallet balance, request payouts, track tier status.
- Cannot: see other architects' data, approve their own payouts, manage other users, access admin routes.
- Access path: `/dashboard` and its sub-routes.

### STAFF (Operations)

- Internal WallDecor employee with limited admin access.
- Can: view all projects, change project statuses, assign caretakers, view partner data.
- Cannot: manage user accounts, execute financial payouts, change system configuration.
- Access path: `/dashboard/admin` and sub-routes (STAFF or ADMIN role required).

### ADMIN (Full Control)

- Internal WallDecor administrator.
- Can: everything STAFF can do, plus execute payouts, manage all users, view all financial metrics, edit project items, manually override architect tiers, set commission rates.
- Cannot: nothing is blocked.
- Access path: `/dashboard/admin` and sub-routes (ADMIN role required for financial actions).

---

## 3. Core Concepts

### Project

- A sales engagement submitted by an architect for a client.
- Lifecycle statuses: `ZGŁOSZONY` → `PRZYJĘTY` → `W_REALIZACJI` → `ZAKOŃCZONY` (also `NIEZREALIZOWANY`).
- Each project has: an owning architect, an optional staff caretaker, one or more project items.
- Projects in `NIEZREALIZOWANY` status are excluded from all financial calculations.
- Admin can change project status at any pipeline stage, not only on initial acceptance.
- Admin can add, edit, or remove project items (e.g. client changes order value from 10 000 → 8 000 PLN).
  - Reducing item amounts: edit the existing project item directly.
  - Increasing order value: add a new project item to the project.

### Project Item

- A line item within a project. Has a type: `PRODUCT` or `INSTALLATION`.
- Has a net amount and an associated commission rate snapshot (captured at finalization).
- Only `PRODUCT` type items contribute to cashback, commissions, and turnover. `INSTALLATION` items are excluded.

### Commission

- The fee WallDecor owes to an architect based on project item amounts.
- States: `EARNED` (project completed, final amount confirmed) or `PENDING` (project in progress, estimated).
- Calculated using a **progressive bracket system** based on the architect's cumulative `PRODUCT` turnover (see §6).
- Stored in the `commissions` table, linked to a project item and project.

### Cashback Wallet

- A balance account per architect. Contains accumulated cashback credits.
- Funded by: 2% of net `PRODUCT` item value when a project reaches `ZAKOŃCZONY` status.
- Debited by: approved payout transactions.
- Balance is the sum of all non-expired credit transactions minus all debit transactions.
- Expiration applies: each credit entry has a 12-month TTL from creation date (FIFO — oldest funds expire first).

### Payout

- A request by an architect to withdraw funds from their cashback wallet.
- Minimum threshold: 300 PLN net. Requests below this are rejected at UI and API level.
- States: `PENDING` (submitted) → `APPROVED` / `REJECTED` (processed by ADMIN).
- On approval: a SPEND debit transaction is created in `wallet_transactions` via `spendCashback()`.

### Tier

- A classification level for architect partners based on **cumulative net turnover** from `PRODUCT` items in non-rejected projects.
- Tiers are calculated dynamically from the `projects` + `project_items` tables (not stored).
- **ADMIN can manually override** an architect's tier via the architect profile page. The override is stored as `tier_override` in the `users` table (`NULL` = use auto-calculated tier).
- Display rule: show `tier_override` if set; otherwise calculate from turnover.

#### Tier Thresholds (Turnover-Based)

| Tier     | Cumulative Turnover      |
| -------- | ------------------------ |
| BEGINNER | < 10 000 PLN             |
| SILVER   | 10 000 – 49 999 PLN      |
| GOLD     | 50 000 – 119 999 PLN     |
| PLATINUM | ≥ 120 000 PLN            |

---

## 4. Admin Dashboard Scope

The admin dashboard at `/dashboard/admin` must display all of the following:

### Global Turnover

- Total net value of all `PRODUCT`-type items from non-rejected projects in the last 12 months.
- Single KPI card with current value.

### Commissions KPIs

- Total `EARNED` commissions and total `PENDING` commissions displayed as separate KPI cards.

### Payout Queue (Pending)

- Count and total sum of payout requests with status `PENDING` awaiting admin approval.
- Displayed as an actionable queue widget (`AdminPayoutsQueue`) with batch approval.

### Payout Forecast (Upcoming)

- **Eligible partners**: wallet balance ≥ 300 PLN and no active `PENDING` payout request. Shows count + total forecast amount. Drilldown shows the list of partners with their balances.
- **Near-eligible partners**: wallet balance 150–299 PLN. Shown as a count. Drilldown shows the list.
- Purpose: helps ADMIN anticipate cash flow obligations before requests are submitted.

### Wallet Totals Across Partners

- Aggregated cashback wallet balance across all architects (excluding expired entries).

### Wallet Expiring Soon

- Sum of wallet credit entries expiring within the next 30 days.

### Partners by Tier

- Count of architects in each tier: BEGINNER, Silver, Gold, Platinum.
- Counts are clickable — drilldown shows the list of architects in that tier.

### Project Pipeline

- Full list of all projects (all statuses), filterable by status and searchable by project name / architect name.
- Admin can change project status inline (with inline confirmation, no browser dialogs).
- Admin can click into a project detail page to edit items and manage the project fully.

### Alerts

- **Brak Opiekuna**: projects without an assigned caretaker — count + list.
- **Nieaktywne (14d)**: projects in active statuses with no update in 14+ days — count + list.

### Activity Feed

- Chronological log of system events (project status changes, payout approvals, new registrations).
- Sourced from `activity_logs` table.

---

## 5. Architect Profile Page (Admin View)

Accessible at `/dashboard/admin/architects/[id]`. Shows full partner data and management controls.

### Sections

- **Personal data**: name, email, studio name, NIP, address, bank account, VAT status. Editable by ADMIN.
- **Financial summary**: current tier, cumulative turnover, EARNED commissions, cashback wallet balance.
- **Commission rate**: editable field for the architect's individual commission rate (used in BEGINNER bracket and as base if no tier override applies).
- **Tier management**: shows current auto-calculated tier + turnover. ADMIN can set a manual `tier_override` (dropdown: Auto / Silver / Gold / Platinum).
- **Project list**: all projects owned by this architect, with status and value. Admin can change project status inline.
- **Wallet transactions**: list of EARN / SPEND / ADJUST entries for this architect.

---

## 6. Partner Dashboard Scope

The partner dashboard at `/dashboard` displays the following for the logged-in architect only:

### Personal Commissions

- Total `EARNED` commissions (completed projects) and `PENDING` commissions (in-progress) as separate figures.

### Personal Wallet

- Current cashback wallet balance (available for payout).
- Earliest expiring amount with expiry date.

### Payout Request

- Button to submit a payout request. Enforces 300 PLN minimum.
- Shows current pending payout status if one exists.
- Routes to `/dashboard/wallet`.

### Tier Progress

- Current tier name with color coding.
- Turnover progress toward next tier threshold (progress bar + PLN remaining).

### Projects Overview

- List of own projects with status and commission earned.
- Links to individual project detail pages.

---

## 7. Financial Logic

### Cashback

- Rate: exactly 2% of net `PRODUCT` item value.
- Trigger: credited when project status changes to `ZAKOŃCZONY`.
- Expiry: 12-month TTL per credit entry (FIFO on debit).

### Commission — Progressive Bracket System

Commission is calculated using marginal rates based on the architect's **cumulative** `PRODUCT` turnover across all non-rejected projects.

| Bracket  | Turnover Range            | Rate                       |
| -------- | ------------------------- | -------------------------- |
| BEGINNER | 0 – 9 999 PLN             | TBD (pending confirmation) |
| SILVER   | 10 000 – 49 999 PLN       | 7%                         |
| GOLD     | 50 000 – 119 999 PLN      | 10%                        |
| PLATINUM | ≥ 120 000 PLN             | 14%                        |

**Calculation rule**: When a project is finalized (`ZAKOŃCZONY`), the commission for each `PRODUCT` item is split across brackets based on the architect's cumulative turnover **before** this project. Each portion is multiplied by its bracket rate.

Example: architect at 90 000 PLN cumulative turnover, new project adds 40 000 PLN:

- 30 000 PLN × 10% (GOLD bracket, fills 90k → 120k) = 3 000 PLN
- 10 000 PLN × 14% (PLATINUM bracket, above 120k) = 1 400 PLN
- Total commission: **4 400 PLN**

**Open item**: BEGINNER rate (0–9 999 PLN bracket) is pending business confirmation. Assumed 0% until confirmed.

### Tier Override

- Admin can manually assign a tier to an architect via the architect profile page.
- `tier_override` stored in `users` table (`NULL` = auto from turnover).
- Override affects display only; commission calculation always uses actual cumulative turnover brackets regardless of displayed tier.

### Other Rules

- **Payout minimum**: 300 PLN. Blocked at UI and API level.
- **FIFO expiry**: expired EARN entries excluded from balance. Oldest entries consumed first on SPEND.
- **Exclusions**: `NIEZREALIZOWANY` projects contribute nothing to turnover, commissions, or cashback.
- **Single source of truth**: `commissions` table is authoritative. No independent recalculation from item amounts in UI queries.

---

## 8. Architecture Principles

- **Single database**: one MySQL schema for all entities. SQLite for local dev via `DB_TYPE=sqlite`.
- **Separate UI per role**: admin lives under `/dashboard/admin`, partner under `/dashboard`. ADMIN/STAFF redirected from `/dashboard` → `/dashboard/admin` by middleware.
- **Shared data model**: both UIs query the same tables (`projects`, `project_items`, `commissions`, `wallet_transactions`, `users`, `activity_logs`, `payout_requests`).
- **Role-based routing**: enforced by `src/middleware.ts` using NextAuth session role.
- **Server-first data fetching**: Server Components fetch via `src/lib/services.ts`. Client-side API calls only for interactive features.
- **SQL portability**: `preprocessSQL` utility normalizes queries for SQLite / MySQL. All queries must pass through it.
- **No browser dialogs**: `confirm()` and `alert()` are banned. All confirmation flows use inline UI components.
- **Locale-safe number formatting**: all `toLocaleString()` calls must pass `'pl-PL'` explicitly to prevent SSR hydration mismatches.

---

## 9. Database Schema Notes

### `users` table additions needed

- `tier_override`: `TEXT NULL` — manual tier override (`NULL` = auto, values: `'SILVER'`, `'GOLD'`, `'PLATINUM'`).

### `payout_requests` table

- Exists (migration 001 applied). Fields: `id`, `architect_id`, `amount`, `status`, `created_at`, `processed_at`, `processed_by`.

### `commissions` table

- `project_id` column added (migration 002 applied).
- Progressive bracket amounts stored per item (each commission row represents one item's commission, split across brackets if needed).

---

## 10. Out of Scope (MVP)

- Email notifications
- Document uploads
- Multi-currency support
- Public registration (accounts created by ADMIN only)
- Mobile-native app
- External integrations (ERP, CRM, accounting)
- Bulk project import
- Detailed audit trail UI
- Gemini API financial analysis
