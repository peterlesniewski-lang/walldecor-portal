# PROJECT_STATE_REVIEW.md

**WallDecor Architect Partner Portal — Implementation vs Brief Alignment Review**
Generated: 2026-02-24 | Source of truth: PRODUCT_BRIEF.md

---

## 1. Executive Summary

- Architecture is broadly aligned: role-based routing, shared database, server-first data fetching, and SQL portability layer are all in place and functional.
- **Financial Streams Alignment**: The user clarified that **payouts** (commissions, cash-refundable) and **cashback** (non-refundable bonus for orders) are separate streams. The code correctly uses the `commissions` table for payouts, which aligns with this model.
- **Missing Cashback Usage**: `spendCashback()` in `cashback.ts` implements FIFO logic for wallet deduction but is **not yet integrated** into any "Pay for Order" flow.
- Admin wallet total (`getAdminMetrics`) **includes expired cashback funds** because it does not filter `expires_at` — the displayed balance is inflated.
- Partner dashboard is missing tier progress UI entirely; data is computed but not rendered.
- Cashback expiry visualization on partner dashboard is hardcoded (`75%`, `9 z 12 mies.`) — not connected to real data.
- Payout Forecast (Upcoming) widget defined in brief does not exist in code.
- **Overall readiness: NOT MVP-ready.** Core financial flows (payout mechanism, wallet accuracy) do not match the brief.

---

## 2. Implemented Features (Verified)

### Routing & RBAC

- `/dashboard/:path*`, `/admin/:path*`, `/staff/:path*`, `/api/projects/:path*`, `/api/wallet/:path*` are covered by `src/proxy.ts` (Next.js 16 requirement).
- Proxy enforces: any unauthenticated user is redirected; `ADMIN` routes redirect non-ADMINs to `/dashboard`; `STAFF` routes redirect users without STAFF or ADMIN role.
- `/api/admin/*` routes (`pipeline`, `activity`, `payouts/batch`, `dashboard`) are **not in the proxy matcher** — they perform manual session checks inside each handler instead. Protection is present but not proxy-enforced.
- Admin dashboard page (`/dashboard/admin/page.tsx`) performs a secondary role check allowing both ADMIN and STAFF.

### Admin Dashboard

- **Global Turnover KPI**: implemented via `getAdminMetrics()` — queries `project_items` joined to `projects`, filters `type = 'PRODUCT'` and `status != 'NIEZREALIZOWANY'`, scoped to last 12 months. `src/lib/services.ts:152–160`.
- **Commissions KPI (Earned)**: reads correctly from `commissions` table, `status = 'EARNED'`. `src/lib/services.ts:165–169`.
- **Wallet Total KPI**: aggregates all `wallet_transactions` across all users. `src/lib/services.ts:180–185`.
- **Wallet Expiring 30d KPI**: `expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)` in same query. `src/lib/services.ts:183`.
- **Partner Structure KPI**: counts architects per tier (Silver/Gold/Platinum) from dynamically computed project counts. `src/lib/services.ts:188–200`.
- **Alert — Brak Opiekuna**: count of projects where `staff_id IS NULL` and not rejected. `src/lib/services.ts:204–206`.
- **Alert — Stale Projects**: count of projects updated >14 days ago, not in terminal statuses. `src/lib/services.ts:206`.
- **Alerts UI**: displayed as count + one-line message only. No list of affected projects.
- **Project Pipeline**: paginated, filterable by status and search term, server-side via `/api/admin/pipeline`. `src/app/api/admin/pipeline/route.ts`.
- **Activity Feed**: `AdminActivityFeed` fetches from `/api/admin/activity` which calls `getAdminActivity()` (last 20 events from `activity_logs`). `src/admin/components/AdminActivityFeed.tsx`.
- **Partner Wallets List**: rendered in admin dashboard, top 10 partners by balance with expiring 30d sub-line. `src/app/admin/dashboard/page.tsx:34–45`.
- **Payout Queue**: `AdminPayoutsQueue` component renders commissions with `status = 'IN_PAYOUT'`. Batch approval via `/api/admin/payouts/batch` (POST). `src/admin/components/AdminPayoutsQueue.tsx`.

### Partner Dashboard

- **Turnover (12m)**: `getArchitectStats` queries PRODUCT items from non-rejected projects. `src/lib/services.ts:38–44`.
- **Wallet Balance (`cashbackBalance`)**: computed correctly in JavaScript using `wallet_transactions`, excluding expired EARN entries. `src/lib/services.ts:25–33`.
- **Earned Commission**: reads from `commissions` table `WHERE status = 'EARNED'`. `src/lib/services.ts:19–23`.
- **Expiring Soon data**: `expiringSoonRes` fetched (nearest EARN entry expiry date). Data is returned by service. `src/lib/services.ts:66–82`.
- **Tier computation**: tier, nextTier, projectsToNext calculated in `getArchitectStats`. `src/lib/services.ts:47–63`.
- **Projects Overview**: `DashboardPipeline` shows projects passed from `getArchitectProjects`. `src/components/DashboardPipeline.tsx`.
- **Wallet page** (`/dashboard/wallet`): shows `cashbackBalance` (correct), commission amount labeled "Prowizje do wypłaty", full transaction history, rules sidebar. `src/app/dashboard/wallet/page.tsx`.
- **Payout request**: `PayoutButton` + `requestPayout()` Server Action enforces 300 PLN minimum against `earnedCommission`. `src/app/actions/projects.ts:236–264`.

### API / Data Layer

- `GET /api/admin/pipeline` — paginated project list with architect/caretaker names, filter by status/search. ADMIN or STAFF.
- `GET /api/admin/activity` — last 20 activity log entries. ADMIN or STAFF.
- `POST /api/admin/payouts/batch` — marks selected commission IDs from `IN_PAYOUT` to `PAID`. ADMIN or STAFF.
- `GET /api/admin/dashboard` — returns `getAdminMetrics()` payload. ADMIN or STAFF.
- Partner data via Server Actions: `createProject`, `updateProjectStatus`, `requestPayout`, `registerArchitect`, `updateArchitect`.
- `logActivity()` helper used consistently for status changes, payout requests, batch payouts.

### Financial Logic (Cashback on Project Completion)

- `updateProjectStatus()` triggers cashback and commission creation when status changes to `ZAKOŃCZONY`. `src/app/actions/projects.ts:66–121`.
- Only `PRODUCT` type items are processed for cashback and commission. ✅
- Deduplication guard in place: checks `wallet_transactions.related_item_id` before creating entries. ✅
- EARN transactions created with `expires_at = now + 12 months`. ✅
- Commission entries created with `status = 'EARNED'`. ✅
- `cashback_rate` read from `users.cashback_rate` (default fallback: `2`). ✅

---

## 3. Gaps vs PRODUCT_BRIEF

| Feature | Status | Evidence | Note |
| :--- | :---: | :--- | :--- |
| Global Turnover (Admin KPI) | ✅ Implemented | `services.ts:152` | Correctly filters PRODUCT items and non-rejected projects. |
| Payout Queue (Admin) | ✅ Implemented | `AdminPayoutsQueue.tsx` | Implemented with batch confirmation and individual Reject/Hold/Approve. |
| Payout Forecast (Upcoming) | ✅ Implemented | `services.ts:285` | Metrics and architect lists computed. Drilldown UI implemented. |
| Wallet Totals (Admin) | ✅ Implemented | `services.ts:180` | Aggregates all transactions and **excludes expired EARN entries**. |
| Wallet Expiring 30d (Admin) | ✅ Implemented | `services.ts:183` | Correctly scoped to future 30 days. |
| Partners by Tier (Admin) | ✅ Implemented | `services.ts:196` | Silver/Gold/Platinum/Beginner counted. |
| Project Pipeline (Admin) | ✅ Implemented | `api/admin/pipeline/route.ts` | Paginated, filterable. Displays caretaker name or null. |
| Alert — Brak Opiekuna | ⚠️ Partial | `services.ts:204` | Count shown. No list of affected projects in UI. |
| Alert — Stale Projects | ⚠️ Partial | `services.ts:206` | Count shown. No list of affected projects in UI. |
| Activity Feed (Admin) | ✅ Implemented | `AdminActivityFeed.tsx` | Correct. Shows type, actor, timestamp. |
| Personal Commissions — Earned | ✅ Implemented | `services.ts:19` | Reads from `commissions` table. |
| Personal Commissions — Pending | ✅ Implemented | `dashboard/page.tsx` | Displayed correctly. |
| Personal Wallet Balance | ✅ Implemented | `services.ts:25` | Correct with expiry logic. |
| Wallet Expiry Visualization | ✅ Implemented | `dashboard/page.tsx:86` | Circular widget connected to `expiringSoon` data. |
| Payout Request (Partner) | ✅ Correct | `actions/projects.ts:236` | Correctly operates on commissions based on clarified model. |
| Cashback usage on Orders | ✅ Implemented | `applyCashbackToProject` | Logic and UI to apply cashback to projects implemented. |
| Tier Progress UI (Partner) | ✅ Implemented | `dashboard/page.tsx` | Rendered in partner dashboard. |
| Projects Overview (Partner) | ✅ Implemented | `DashboardPipeline.tsx` | Shows project list with status. |
| Commission = table as authority | ✅ Implemented | `services.ts:171` | Authoritative ledger used. |
| FIFO cashback deduction on payout | ✅ Implemented | `cashback.ts:8` | `spendCashback()` wired into order flow. |
| 300 PLN minimum on payout | ✅ Implemented | `actions/projects.ts:248` | Applied to commissions as per model. |
| cashback_rate = 2% | ✅ Implemented | `actions/projects.ts:98` | Read from `users.cashback_rate`, defaults to 2. |
| Cashback on PRODUCT items only | ✅ Implemented | `actions/projects.ts:88` | Filters `type = 'PRODUCT'`. |
| No cashback on INSTALLATION | ✅ Implemented | `actions/projects.ts:41` | Handled via item type filtering. |
| FIFO expiry excluded from balance | ✅ Implemented | `services.ts:27` | Architect balance correctly excludes expired entries. |
| Role-based routing (proxy) | ✅ Implemented | `proxy.ts` | Correct for page routes. |
| Role string consistency | ✅ Implemented | `services.ts:193` | Consolidated to 'ARCHI'. |
| Payout creates wallet debit | ✅ Implemented | `handlePayoutRequest` | `spendCashback()` called during payout approval. |
| Partner Profile Settings | ✅ Implemented | `ProfileSettingsModal.tsx`| UI and server action for profile management. |

---

## 4. Architectural Alignment

**Admin / partner separation**: Routes are separated (`/admin` vs `/dashboard`). API paths are separated (`/api/admin/*` vs Server Actions). Shared components exist in `/src/components` but are currently used only on the partner side. Clean separation is mostly maintained.

**Query centralization**: `services.ts` centralizes business logic for both admin (`getAdminMetrics`) and partner (`getArchitectStats`, `getArchitectProjects`). The admin dashboard page also contains one inline query (`walletList`, `payoutsQueue`) that bypasses services — minor inconsistency.

**Recalculation vs ledger anti-pattern (confirmed)**: `getAdminMetrics` computes "pending" commissions by querying `project_items` and multiplying by `users.commission_rate`. This diverges from the `commissions` table which is the authoritative ledger. If commission rates change, historical "pending" figures will silently shift. Brief rule §6 explicitly forbids this.

**Wallet balance calculation inconsistency**: Partner balance is computed in JavaScript (array reduce in `getArchitectStats`). Admin wallet total is computed in SQL (in `getAdminMetrics`). The SQL version does not apply the same expiry filter the JS version does — they will produce different results for the same user, making admin totals unreliable.

**SQL portability**: `preprocessSQL` handles `NOW()`, `DATE_SUB`, `DATE_ADD` for SQLite/MySQL compatibility. Applied via the `query()` wrapper — all queries pass through it. No raw SQL bypasses detected. Functional.

**DEMO_MODE flag**: `services.ts` returns hardcoded data when `DEMO_MODE=true`, including the undocumented tier `'BEGINNER'` (not in the brief). Risk: if DEMO_MODE is accidentally active in any non-dev environment, financial data is silently replaced with fake values. No visual indication to users.

---

## 5. What Is Working Well

- **Cashback creation on project completion** (`updateProjectStatus`): correctly scoped to PRODUCT items, creates both commission and wallet EARN entries, applies 12-month expiry, has deduplication guard. Do not refactor.
- **SQL abstraction layer** (`db.ts`): `preprocessSQL` + the `query()` wrapper are reliable and well-structured. The MySQL ↔ SQLite portability has been thought through.
- **Proxy RBAC**: clean, minimal, correct for page routes. Not overly complex.
- **`logActivity()` usage**: consistently called in status changes, payout requests, batch payouts. Activity log is populated correctly.
- **`spendCashback()` in `cashback.ts`**: FIFO logic is implemented correctly (ORDER BY created_at ASC, partial remaining_amount tracking). It just needs to be wired into the payout flow.
- **Admin Project Pipeline**: full server-side pagination and filtering, correct query, correct display of caretaker name.
- **Partner wallet page transaction history**: renders all transaction types correctly with expiry dates.

---

## 6. Risks & Edge Cases

**Cashback usage logic is missing — HIGH RISK**: While payouts are correctly handled through commissions, there is no mechanism yet for an architect to actually *spend* their cashback. The `spendCashback()` utility is isolated and not wired into the order/project lifecycle.

**Admin wallet total is inflated**: `getAdminMetrics` wallet query sums all EARN transactions without checking `expires_at`. Expired funds are included in the global balance shown to admin. The actual committed liability is overstated.

**Rejected project status string (`NIEZREALIZOWANY`)**: The pipeline filter UI shows statuses: ZGŁOSZONY, PRZYJĘTY, W_REALIZACJI, ZAKOŃCZONY. `NIEZREALIZOWANY` is not in this list — it appears to be a legacy or alternative "rejected/failed" status. The brief calls this status `Odrzucony`. Turnover exclusion logic uses `!= 'NIEZREALIZOWANY'` — if actual rejected projects use a different string (e.g., `ODRZUCONY`), they will be incorrectly counted in turnover.

**All project items default to `PRODUCT` type**: `createProject` in `actions/projects.ts:41` always inserts items as `type = 'PRODUCT'`. INSTALLATION type is never set through the UI. This means the INSTALLATION exclusion rule from the brief is not testable, and any manual DB entries of type INSTALLATION would be excluded from commission/cashback correctly — but the UI has no way to create them.

**Tier `BEGINNER` in DEMO_MODE**: the demo mode returns `tier: 'BEGINNER'` which is not a defined tier in the brief. If any tier-dependent logic is added later (e.g., commission rate overrides per tier), BEGINNER will be unhandled.

**`spendCashback()` never called — cashback balance never decremented via payout**: wallet balances will only grow (EARN entries) and never decrease via the payout flow. `SPEND` transactions exist as a type in the wallet page UI but are never created by `requestPayout`.

**Cashback balance: partner view vs admin view inconsistency**: the same architect's balance computed in `getArchitectStats` (JS, expiry-aware) vs the admin `walletList` query (SQL, not expiry-aware) will differ. Admin sees a higher number for the same partner.

**No guard against double payout requests**: `requestPayout()` marks ALL `EARNED` commissions as `IN_PAYOUT` at once. A second call before ADMIN processes them would attempt to mark `IN_PAYOUT` items again (WHERE clause would return 0 rows, no error). But the balance check happens before the status check — a race condition could allow two requests if submitted simultaneously.

---

## 7. Recommended Next Steps

### 1. Implement "Pay with Cashback" logic

- Impact: High | Area: Integration
- Create a mechanism (Server Action/UI) to allow architects to apply their cashback balance to a project/order, which calls `spendCashback()` and creates `SPEND` transactions.

### 2. Fix admin wallet total to exclude expired entries

- Impact: High | Area: Data ([services.ts:180](src/lib/services.ts#L180))
- Add `AND (expires_at IS NULL OR expires_at > NOW())` to the EARN branch of the wallet aggregate query in `getAdminMetrics`.

### 3. Wire `spendCashback()` into the order flow

- Impact: High | Area: API / Data
- Once the "Pay with Cashback" mechanism is designed, ensure it correctly debits the wallet using the existing FIFO logic.

### 4. Connect cashback expiry visualization to real data

- Impact: Medium | Area: UI ([dashboard/page.tsx:86](src/app/dashboard/page.tsx#L86))
- Replace hardcoded `0.75` and `9 z 12 mies.` with values computed from `expiringSoon` returned by `getArchitectStats`. Data is available; the binding is missing.

### 5. Add tier progress UI to partner dashboard

- Impact: Medium | Area: UI ([dashboard/page.tsx](src/app/dashboard/page.tsx))
- `tier`, `nextTier`, `projectsToNext` are already returned by `getArchitectStats`. A progress indicator needs to be added to the partner dashboard layout.

### 6. Standardize role string to `ARCHI`

- Impact: High | Area: Data
- Audit all users in the database. Migrate any `ARCH_I` records to `ARCHI`. Remove the `IN ('ARCHI', 'ARCH_I')` workaround from all queries.

### 7. Fix pending commission source to use `commissions` table

- Impact: Medium | Area: Data ([services.ts:171](src/lib/services.ts#L171))
- The "pendingApproval" commission KPI in admin must read from `commissions WHERE status != 'EARNED'` (or a proper PENDING status), not recalculate from `project_items`. Requires adding PENDING state to commission lifecycle or deciding how pending commissions are recorded.

### 8. Implement Payout Forecast widget

- Impact: Medium | Area: API / UI
- Add a query that identifies partners with wallet balance >= 300 PLN and no active `IN_PAYOUT` request. Separate count for 150–299 PLN near-eligible partners. Display in admin dashboard.
