# PROGRESS.md — WallDecor Architect Partner Portal

Last updated: 2026-02-24 (audit session 2)

---

## Status ogólny

Aplikacja działająca lokalnie (Next.js 14 App Router, SQLite dev). Faza MVP w trakcie realizacji.

---

## Ukończone etapy

### Faza 0 — Inicjalizacja

- Podstawowa struktura katalogów
- Pliki konfiguracyjne projektu

### Faza 1 — Fundament techniczny

- Next.js 14 App Router + TypeScript
- NextAuth.js z rolami (ARCHI, STAFF, ADMIN)
- Warstwa DB: SQLite lokalnie (`better-sqlite3`), MySQL produkcyjnie (`mysql2`)
- `preprocessSQL()` — normalizacja zapytań SQL między dialektami (`NOW()`, `DATE_SUB`, `DATE_ADD`)
- `query<T>()` — jednolity interfejs do obu baz danych
- Proxy RBAC: ochrona tras `/dashboard/admin/*` (ADMIN/STAFF), `/dashboard/*` (ARCHI)
- Przekierowanie admin/staff z `/dashboard` → `/dashboard/admin`

### Faza 2 — Model danych i migracje

Wszystkie migracje zastosowane w SQLite:

| Migracja | Opis |
| -------- | ---- |
| 001 | Tabela `payout_requests` (id, architect_id, amount, status, created_at, processed_at, processed_by) |
| 002 | Kolumna `project_id` w `commissions` + backfill; standaryzacja roli `ARCH_I` → `ARCHI` |
| 003 | Kolumna `tier_override TEXT NULL` w `users` (ręczny override tieru przez ADMIN) |

Schemat główny (tabele):

- `users` — architekci i pracownicy, pola: commission_rate, tier_override
- `projects` — z lifecycle statusów: ZGŁOSZONY → PRZYJĘTY → W_REALIZACJI → ZAKOŃCZONY (lub NIEZREALIZOWANY)
- `project_items` — type: PRODUCT | INSTALLATION; tylko PRODUCT liczy się do prowizji i cashbacku
- `commissions` — status: PENDING (projekt przyjęty) → EARNED (projekt zakończony)
- `wallet_transactions` — type: EARN / SPEND / ADJUST; EARN z 12-miesięcznym TTL
- `payout_requests` — status: PENDING → APPROVED / REJECTED
- `activity_logs` — chronologiczny log zdarzeń systemowych

### Faza 3 — Logika finansowa

#### System tierów (oparty na obrocie PLN)

| Tier | Próg obrotu | Stawka |
| ---- | ----------- | ------ |
| BEGINNER | < 10 000 PLN | 7% |
| SILVER | 10 000 – 49 999 PLN | 7% |
| GOLD | 50 000 – 119 999 PLN | 10% |
| PLATINUM | ≥ 120 000 PLN | 14% |

- Tier obliczany dynamicznie z tabeli `project_items` (suma `amount_net` gdzie `type = 'PRODUCT'` i `status != 'NIEZREALIZOWANY'`)
- `tier_override` w tabeli `users` ma pierwszeństwo nad wyliczonym tierem (NULL = auto)
- Override wpływa tylko na wyświetlanie; obliczenia prowizji zawsze na podstawie rzeczywistego obrotu

#### Progresywny system prowizji

Prowizja obliczana marżowo według przedziałów cumulative turnover:

| Przedział | Zakres | Stawka |
| --------- | ------ | ------ |
| BEGINNER | 0 – 9 999 PLN | 0% (TBD — do potwierdzenia biznesowego) |
| SILVER | 10 000 – 49 999 PLN | 7% |
| GOLD | 50 000 – 119 999 PLN | 10% |
| PLATINUM | ≥ 120 000 PLN | 14% |

Przykład: architekt z obrotem 90 000 PLN, nowy projekt 40 000 PLN:

- 30 000 PLN × 10% = 3 000 PLN (GOLD, wypełnia do 120k)
- 10 000 PLN × 14% = 1 400 PLN (PLATINUM, powyżej 120k)
- Łącznie: 4 400 PLN

Implementacja w `updateProjectStatus` (ZAKOŃCZONY):

1. Pobiera cumulative turnover PRZED tym projektem (tylko ZAKOŃCZONY, bez bieżącego)
2. Iteruje po PRODUCT items projektu
3. Dla każdego itemu: dzieli kwotę przez przedziały (`runningTurnover` przechodzi przez każdy bracket)
4. Tworzy/aktualizuje rekord w `commissions` (PENDING → EARNED lub nowy EARNED)
5. Kredytuje cashback 2% na `wallet_transactions` (EARN, wygasa po 12 miesiącach)

#### Cashback

- Stawka: 2% wartości netto PRODUCT items
- Trigger: status projektu zmienia się na ZAKOŃCZONY
- Wygaśnięcie: TTL 12 miesięcy od EARN (FIFO przy wypłacie)
- Guard: nie przetwarza ponownie jeśli wallet_transactions dla tego projektu już istnieją

#### Payout

- Minimum: 300 PLN (walidacja na poziomie UI i API)
- Flow: architekt składa wniosek → ADMIN zatwierdza/odrzuca
- Tabela: `payout_requests`
- Batch approval: `AdminPayoutsQueue` (zaznacz wiele → zatwierdź naraz przez `/api/admin/payouts/batch`)

### Faza 4 — Interfejs użytkownika

#### Panel architekta (`/dashboard`)

- KPI: prowizje EARNED + PENDING, saldo portfela
- Status partnera: tier z progress barem (PLN-based, nie project-count)
- Lista własnych projektów
- Payout button (min 300 PLN)

#### Panel admin (`/dashboard/admin`)

**Row 1 — Globalne KPI finansowe:**

- Obrót (12m) — suma PRODUCT items, niezrealizowane wykluczone
- Prowizje zarobione (EARNED)
- Prowizje w toku (PENDING)
- Portfel łącznie (bez wygasłych EARN)
- Wygasa w 30 dni

**Row 2 — Liczniki operacyjne:**

- Partnerzy Silver / Gold / Platinum (turnover-based)
- Do Akceptacji (projekty ZGŁOSZONY)
- Brak Opiekuna (projekty bez staff_id)
- Nieaktywne (14d)

**Sekcje główne:**

- Kolejka zgłoszeń (ZGŁOSZONY) — `AdminProjectListItem` z inline confirmation
- Kolejka wypłat — `AdminPayoutsQueue` z batch approval
- Ranking obrotów (top 5 architektów)
- Activity Feed
- **Pipeline Projektów** — `AdminProjectPipeline`: pełna lista ALL statuses, filtrowanie + wyszukiwanie, inline status transitions z confirmation

**Sidebar prawy:**

- Prognoza wypłat (eligible ≥300 PLN, near-eligible 150–299 PLN)
- Lista architektów z linkami do profili

#### Profil architekta (`/dashboard/admin/architects/[id]`)

Dostępny z listy architektów (ExternalLink → Link).

Sekcje:

- KPI finansowe: obrót, prowizje, portfel
- Dane osobowe (imię, email, studio, NIP, adres, konto, VAT)
- Zarządzanie tier (ADMIN only): override dropdown + stawka prowizji BEGINNER
- Lista projektów (wszystkie statusy) z linkami do `/dashboard/admin/projects/[id]`
- Historia transakcji portfela (ostatnie 30)

Server action: `updateArchitectAdminFields` w `/src/app/actions/architects.ts`

#### Szczegóły projektu (`/dashboard/admin/projects/[id]`)

Strona ADMIN/STAFF z pełnym widokiem i edycją projektu.

Sekcje (server component `page.tsx`):

- Nagłówek: nazwa projektu, klient, status badge, data, link do architekta
- KPI strip: wartość produktów, montaż, prowizja earned, prowizja pending
- Sekcja interaktywna → `AdminProjectDetailClient`

`AdminProjectDetailClient` (client component):

- **Status panel** — zmiana statusu z inline confirmation (phase: idle → confirming → executing)
  - ZGŁOSZONY → PRZYJĘTY | NIEZREALIZOWANY
  - PRZYJĘTY → W_REALIZACJI | NIEZREALIZOWANY
  - W_REALIZACJI → ZAKOŃCZONY | NIEZREALIZOWANY
  - ZAKOŃCZONY / NIEZREALIZOWANY → brak przejść
- **Lista pozycji** — PRODUCT i INSTALLATION osobno, pogrupowane
  - Edycja kwoty inline (kliknięcie ołówka → input → Zapisz/Anuluj, Enter/Escape)
  - Usuwanie z inline confirm "Usunąć? Tak/Nie" (zablokowane dla ZAKOŃCZONY)
- **Formularz dodawania pozycji** (ADMIN only, ukryty dla ZAKOŃCZONY)
  - Toggle PRODUCT/INSTALLATION, pola: kategoria, opis, kwota
- **Tabela prowizji** — pozycje projektu z kwotami PENDING/EARNED

Server actions (wszystkie w `/src/app/actions/projects.ts`):

- `updateProjectItem(itemId, amount_net)` — ADMIN only
- `addProjectItem(projectId, { type, category, description?, amount_net })` — ADMIN only
- `deleteProjectItem(itemId)` — ADMIN only, guard: blokuje dla ZAKOŃCZONY

#### `AdminPayoutsQueue` — inline confirmation

Zastąpienie `confirm()`/`alert()` phase-based UI:

- State: `'idle' | 'confirming' | 'loading' | 'error'`
- `processedTotal` — flash sukcesu po wykonaniu
- Elementy listy: `opacity-50 pointer-events-none` gdy phase !== 'idle'
- Inline banner: count + suma PLN → "Tak, wypłać" → loading spinner → sukces/błąd

### Faza 5 — Konwencje i zasady architektoniczne

#### Wzorce kodowania

- **Server-first**: Server Components fetch data via `src/lib/services.ts`, Client Components używają Server Actions
- **Brak `confirm()`/`alert()`**: inline confirmation UI (state: idle → confirming → executing)
- **Locale-safe**: wszystkie `.toLocaleString()` muszą mieć `'pl-PL'` jako argument (hydration safety)
- **SQL portability**: wszystkie zapytania przez `query()` z `preprocessSQL()` — nie pisać raw SQL z dialektem MySQL poza tym
- **`revalidatePath()`** po każdej mutacji danych po stronie serwera
- **`router.refresh()`** po Server Actions w Client Components

#### Struktura plików

```text
src/
  app/
    actions/
      projects.ts      — createProject, updateProjectStatus, registerArchitect,
                         requestPayout, updateProjectItem, addProjectItem, deleteProjectItem
      architects.ts    — updateArchitectAdminFields
    dashboard/
      page.tsx          — partner dashboard (ARCHI)
      admin/
        page.tsx        — admin dashboard (ADMIN/STAFF) [aktywny]
        architects/[id]/
          page.tsx      — profil architekta
          ArchitectProfileClient.tsx — tier override + commission rate form
        projects/[id]/
          page.tsx      — szczegóły projektu (server component)
          AdminProjectDetailClient.tsx — edycja items, zmiana statusu
      projects/         — lista projektów partnera
      wallet/           — portfel partnera
    admin/dashboard/
      page.tsx          — STARA ścieżka admin (nadal działa, ma AdminProjectPipeline)
    api/
      admin/
        payouts/batch/  — batch payout approval
        pipeline/       — (stary endpoint, zastąpiony server-side fetch)
  components/           — shared components (AdminProjectListItem, ArchitectList, ...)
  admin/components/     — admin-only components (AdminPayoutsQueue, AdminProjectPipeline, ...)
  lib/
    db.ts              — query<T>(), preprocessSQL()
    services.ts        — getArchitectStats(), getArchitectProjects(), getAdminMetrics(), logActivity()
    auth.ts            — NextAuth config
    cashback.ts        — cashback utilities
  proxy.ts            — RBAC routing + admin redirect
migrations/
  001_payout_requests.sql
  002_commissions_project_id.sql
  003_add_tier_override.sql
```

**Uwaga — dwa pliki admin dashboard:**

- `src/app/dashboard/admin/page.tsx` — aktywna ścieżka (`/dashboard/admin`), tu są wszystkie zmiany z sesji 2-3
- `src/app/admin/dashboard/page.tsx` — stara ścieżka (`/admin/dashboard`), zaktualizowana o `allProjects` query i propsy `AdminProjectPipeline`, ale może być przestarzała w innych sekcjach

---

### Faza 6 — Nowe pola dokumentowe (sesja 3)

- **Migration 006** (`006_add_item_fields.sql`): dodano `order_number`, `invoice_number`, `is_paid` do `project_items`; `invoice_number` do `payout_requests`
- **Server action `updateProjectItemMeta`**: aktualizacja metadanych pozycji bez przeliczania prowizji (ADMIN/STAFF)
- **Server action `updatePayoutInvoiceNumber`**: zapis nr faktury architekta na wniosku wypłaty (ADMIN/STAFF)
- **`addProjectItem`**: rozszerzony o opcjonalne `order_number`, `invoice_number`, `is_paid`
- **`AdminProjectDetailClient`**: `ItemRow` wyświetla chipy Zam/FV/Opłacone; nowy przycisk FileText → metadata edit form; `AddItemForm` zawiera pola nr zamówienia, nr faktury, toggle opłacone
- **`AdminPayoutsQueue`**: nowy `InvoiceNumberField` — inline edycja nr faktury architekta w każdym wierszu kolejki

#### Konwencje

- `is_paid` przechowywany jako BOOLEAN/INT (0/1) w DB; mapowany na `Boolean(item.is_paid)` w UI
- Edycja kwoty (`updateProjectItem`) i edycja metadanych (`updateProjectItemMeta`) to oddzielne ścieżki — metadata nie przelicza prowizji
- Pola metadata są opcjonalne — NULL w DB, pusty string w UI traktowany jako brak wartości

---

### Faza 7 — Dashboard tabs + Settings page (sesja 3 cd.)

- **`DashboardBottomTabs`** (`src/admin/components/DashboardBottomTabs.tsx`): tabbed card zastępujący 3 osobne sekcje (Aktywność, Cashback, Pipeline) — tab "Aktywność" + tab "Pipeline projektów"
- **`admin/page.tsx`**: usunięte oddzielne `AdminActivityFeed`, `AdminRedemptionQueue`, `AdminProjectPipeline`; zastąpione `<DashboardBottomTabs>`; wyczyszczone nieużywane importy
- **`AdminActivityFeed.tsx`**: poprawka `text-slate-200` → `text-stone-700` (dark theme leftover)
- **Migration 007** (`007_add_last_login.sql`): `ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL`
- **`auth.ts`**: po udanym logowaniu `UPDATE users SET last_login_at = CURRENT_TIMESTAMP` (fire-and-forget)
- **`actions/settings.ts`** (nowy): `createUser`, `resetUserPassword`, `updateUserRole` — wszystkie ADMIN only
- **`/dashboard/admin/settings/page.tsx`** (nowy): server component, lista ADMIN/STAFF + shortcut do Architektów
- **`SettingsTeamClient.tsx`** (nowy): tabela zespołu, inline reset hasła (ręczne + auto-generate 12-znakowe), dodawanie nowego użytkownika STAFF/ADMIN, zmiana roli przez `<select>`
- **`Sidebar.tsx`**: href Ustawień zmieniony z `/dashboard/settings` → `/dashboard/admin/settings`

#### Konwencje (Faza 7)

- Reset hasła: `PasswordInput` z show/hide + przycisk Copy; "Auto" generuje 12-znakowe hasło po stronie klienta
- Zmiana własnej roli zablokowana (guard w `updateUserRole`)
- `last_login_at` ustawiane fire-and-forget — nie blokuje procesu autoryzacji

---

---

### Faza 9 — OAuth + Reset hasła (sesja 5, 2026-03-17)

- **Google OAuth**: dodano `GoogleProvider` do NextAuth; `signIn` callback obsługuje auto-create ARCHI lub match po emailu dla istniejących kont
- **Schema**: `users.password` nullable; nowe kolumny `provider VARCHAR(20) DEFAULT 'credentials'`, `provider_account_id VARCHAR(255)` z uniq index
- **Migracje**: 012 (OAuth kolumny users), 013 (tabela `password_reset_tokens`), 014 (email template PASSWORD_RESET)
- **Reset hasła**: nowe strony `/auth/forgot-password` + `/auth/reset-password`; API routes `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`; tokeny UUID ważne 1h, jednorazowe
- **Signin page**: przycisk "Zaloguj przez Google" + link "Zapomniałeś?" zamiast "skontaktuj się z administratorem"
- **Env**: dodano `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` do `.env.example`; redirect URI: `{NEXTAUTH_URL}/api/auth/callback/google`

#### Konwencje (Faza 9)

- Tylko `provider='credentials'` może resetować hasło; Google userzy nie mają hasła (NULL)
- Reset hasła nie ujawnia czy email istnieje w systemie (anti-enumeration)
- Auto-create: nowy user przez Google → `role='ARCHI'`, `name` z Google profile
- Istniejący user loguje się przez Google: `provider_account_id` uzupełniany przy pierwszym OAuth logowaniu

---

## Otwarte kwestie

| # | Kwestia | Status |
| - | ------- | ------ |
| 1 | Stawka prowizji BEGINNER (0–9 999 PLN) | TBD — wymagana decyzja biznesowa |
| 2 | Drilldown Prognoza Wypłat — klikalne liczniki "Gotowi do wypłaty" / "Prawie gotowi" | Do implementacji |
| 3 | Funkcjonalność modalu "Ustawienia Profilu" w panelu partnera | Do implementacji |

---

### Faza 8 — Poprawki krytyczne i CSV import (sesja 4)

- **CSV import** (`src/app/actions/import.ts`, `src/admin/components/AdminCSVImportModal.tsx`): import projektów z CSV Google Sheets; mapowanie 15 kolumn; auto-rejestracja architekta (bcrypt, sendEmail); guard duplikatów po `order_number`; modal 3-krokowy (upload → preview → wyniki)
- **Import Google Apps Script** (`import.txt`): skrypt do scalania arkuszy per-architekt z Drive do jednego pliku CSV
- **Prowizja per pozycja** (`src/components/ProjectListClient.tsx`): każda pozycja projektu pokazuje `+XX PLN prowizji` lub `bez prowizji` z matched commission via `project_item_id`
- **Wniosek wypłaty w historii** (`src/app/dashboard/wallet/page.tsx`): payout requests widoczne u góry historii operacji z kolorowanymi statusami (PENDING/IN_PAYMENT/HOLD/REJECTED/PAID)
- **Middleware RBAC** — `src/proxy.ts` przemianowany na `src/middleware.ts`; Next.js teraz faktycznie ładuje middleware i chroni `/dashboard/admin/*`
- **FIFO blokowanie prowizji** (`requestCommissionPayout` w `projects.ts`): zamiast blokowania WSZYSTKICH EARNED, teraz FIFO po `created_at ASC` — blokowane tylko tyle prowizji ile potrzeba do pokrycia kwoty wniosku
- **Faktura PDF** — pliki zapisywane do `private_uploads/invoices/` (nie `public/`); endpoint `/api/invoices/[filename]/route.ts` z weryfikacją sesji i właściciela; magic bytes `%PDF` sprawdzane server-side
- **Minimalna kwota** — ujednolicona na 100 PLN (kod i UI zgodne)

---

## Decyzje projektowe (log)

| Data | Decyzja |
| ---- | ------- |
| 2026-02-24 | Tier system zmieniony z project-count-based na turnover-based (PLN) |
| 2026-02-24 | Prowizja: progresywny system marżowy (7%/10%/14%), BEGINNER TBD |
| 2026-02-24 | `tier_override` w users — ADMIN może ręcznie ustawić tier; override dotyczy tylko wyświetlania |
| 2026-02-24 | Wszystkie `confirm()`/`alert()` zastąpione inline confirmation state |
| 2026-02-24 | `toLocaleString()` zawsze z `'pl-PL'` — zapobiega hydration mismatch (SSR vs browser) |
| 2026-02-24 | `AdminProjectPipeline` przepisany z API-fetch na server-fetched props (spójne z resztą) |
| 2026-02-24 | Cashback BEGINNER rate = 2% (niezależny od commission rate) |
| 2026-02-24 | Utworzono PROJECT_STATE_REVIEW.md w celu uzgodnienia stanu projektu z briefem |
| 2026-02-24 | Potwierdzono separację /admin vs /dashboard i działanie RBAC w middleware |
| 2026-02-24 | Etap 1: Light theme — globals.css (cream #FAF8F5 tło, white karty, dark/5 borders), dashboard/layout.tsx, Sidebar.tsx zaktualizowane z dark → warm neutrals |
| 2026-02-24 | Etap 3: Recharts 3.7.0 — AdminCharts.tsx (BarChart obrót miesięczny + PieChart rozkład tierów), wbudowany w /dashboard/admin |
| 2026-02-24 | Etap 4: Light theme class sweep — bulk perl substitution across 69 .tsx/.ts files: dark bg hex → bg-card/bg-background, border/bg-white/N → black overlays, text-white → text-stone-900, slate-x → stone-x, x-400 icon colors → x-600 for light bg visibility, dark -900/N color overlays → -50 equivalents |
