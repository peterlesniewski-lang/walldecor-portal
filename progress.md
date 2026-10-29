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

### Faza 10 — Nowy program partnerski + uwagi testera (sesja 6, 2026-07-02)

- **Program partnerski 10/12/15%**: `src/lib/partnerProgram.ts` — jedyne źródło stawek; Partner 10% (0–30k), Partner Plus 12% (30–50k), Partner Premium 15% (50k+); zastąpił brackety 7/10/14 i zaszyte `rate = 7`
- **Stawka na prowizji**: kolumna `commissions.rate` (migracja 016) — historyczne prowizje nie zmieniają się po awansie; stawka projektu liczona z obrotu PRZED projektem (awans od kolejnego projektu)
- **tier_override** (PARTNER/PARTNER_PLUS/PARTNER_PREMIUM; stare wartości mapowane) wpływa teraz na stawkę, nie tylko wyświetlanie; zmiana logowana w activity_logs
- **Formularz architekta**: wartość netto opcjonalna („szacunkowy budżet"); pozycje z kwotą 0 zapisywane do wyceny przez staff/admin
- **Wymuszenie zmiany hasła**: `users.must_change_password` + `password_changed_at` (migracja 016); flaga ustawiana przy rejestracji/imporcie/resecie przez admina; redirect w `dashboard/layout.tsx` → `/auth/change-password` (server action `changeOwnPassword`, polityka: 8+ znaków, litera+cyfra)
- **Mail powitalny**: nowa treść wg briefu (migracja 017 + `ensure-production-schema.mjs`, jednorazowo po starym temacie); `sendEmail` wycina obrazki data-URI (źródło załącznika „Prtnsc") i dodaje plain-text fallback
- **Hasła tymczasowe**: zawsze generowane losowo (12 znaków); brak `Czubaszek123` w kodzie — było wpisywane ręcznie przez admina; reset hasła min. 8 znaków
- **UI statusów**: dashboard architekta (status, % prowizji, progress), profil architekta, lista/filtry architektów, AdminCharts, regulamin §3/§4 — wszystko na nowych statusach
- **Audyt**: logActivity dla zmian wartości pozycji, dodania/usunięcia pozycji i override statusu
- **Wypłaty (uwaga testera)**: przyciski akceptacji są ADMIN-only (`handlePayoutRequest`); STAFF widzi komunikat read-only — tester logował się jako STAFF, brak zmiany logiki

---

---

### Audyt gotowości do wdrożenia (sesja 7, 2026-10-22)

- Pełny przegląd kodu bez zmian w `src/`; raport w `AUDIT-2026-10-22.md` (9 blokerów P0, 9 punktów P1, lista P2)
- Werdykt: nie wypuszczać do klientów przed naprawą P0 — głównie F-101/F-102/F-103 (podwójna prowizja przy korekcie i imporcie, cashback nieobniżany), F-104 (karta projektu liczy 15% dla wszystkich), F-105 (404 na „Wypłać środki"), F-106 (regulamin: obca marka, próg 300 vs 100 PLN), F-108 (brak wersji mobilnej)
- Weryfikacja: testy 52/52, `next build` OK, ESLint baseline 244 błędów (`no-explicit-any`)
- Zainstalowano `node_modules` z `--ignore-scripts` (better-sqlite3 nie buduje się lokalnie przez node-gyp) — wyłącznie do sprawdzenia builda

### Naprawy po audycie (sesja 7 cd., 2026-10-22)

- Wykonano wszystkie tickety z `PLAN-NAPRAWY-2026-10-22.md` (T1–T10) przez agentów Sonnet/Haiku; orkiestracja i weryfikacja: Fable
- Finanse: korekty w ZAKOŃCZONYM sumują EARNED+IN_PAYMENT+PAID, SPEND cashbacku przez FIFO `spendCashback`, wszystko w `withTransaction`; wniosek o wypłatę blokuje wszystkie EARNED; guard ponownej finalizacji sprawdza też prowizje
- Import CSV: „rozliczona = Tak” → projekt ZAKOŃCZONY + prowizja PAID (`c_<item>_import`), bez cashbacku, bez `updateProjectStatus`
- PENDING per pozycja (także po wycenie pozycji z kwotą 0); obrót w panelu admina liczony tylko z ZAKOŃCZONY + KPI „Pipeline”; prognoza wypłat liczona z prowizji EARNED (progi 100/50 PLN); wykres miesięczny po `completed_at`
- UI architekta: prowizje z tabeli `commissions` (bez martwego `commission_rate`), link do `/dashboard/wallet`, usunięta fałszywa statystyka; regulamin: marka WallDecor, próg 100 PLN, v1.1
- Mobile: `MobileNav.tsx` (hamburger + drawer), sidebar `hidden lg:flex`, responsywny layout i header
- Bezpieczeństwo: nagłówki w `next.config.ts`, `src/lib/rateLimit.ts` (login + forgot-password per IP/email), logowanie po `LOWER(email)`, jednolita polityka haseł (`validatePasswordStrength`), walidacja przejść statusów (`ALLOWED_TRANSITIONS`), walidacja opiekuna i pozycji
- Porządki: usunięte 16 martwych plików (stary `/admin/*`, nieużywane komponenty i API), `/admin/*` → redirect, zero `alert()`/`confirm()` (test `noBrowserDialogs`), STAFF widzi wnioski cashback
- Weryfikacja końcowa: 82/82 testów, `tsc` czysty w `src/`, `next build` OK
- Otwarte: `deploy/nginx.conf` to wariant HTTPS — na serwerze najpierw certbot; odrzucone wnioski nie są widoczne na stronie projektu admina (`payout_id` zerowany przy REJECTED); korekta w dół po wypłacie może dać ujemną „prowizję dostępną”; brak testu w przeglądarce (mobile)

## Otwarte kwestie

| # | Kwestia | Status |
| - | ------- | ------ |
| 1 | ~~Stawka prowizji BEGINNER (0–9 999 PLN)~~ | Rozwiązane — nowy program: start = Partner 10% |
| 2 | Drilldown Prognoza Wypłat — klikalne liczniki "Gotowi do wypłaty" / "Prawie gotowi" | Do implementacji |
| 3 | Funkcjonalność modalu "Ustawienia Profilu" w panelu partnera | Do implementacji |
| 4 | Okres przejściowy (legacyRate do 2026-12-31) z briefu | Nieimplementowane — nowe stawki są wyższe od starych na każdym poziomie, ochrona bez skutku praktycznego; edge case'y przez tier_override |
| 5 | Tryby prowizji LIMITED/EXCLUDED per pozycja (brief §3) | Częściowo — INSTALLATION wyłączone z prowizji; pełne tryby do osobnej iteracji |

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

## 2026-10-23 — Moduł zaproszeń (masowe dodawanie architektów)

- Nowa tabela `invitations` (migracja 018, seed-dev, `ensure-production-schema.mjs` tworzy ją w MySQL + dodaje szablon `ARCHITECT_INVITED`, jeśli brak); token 64 hex, ważność 14 dni, status PENDING/ACCEPTED/REVOKED, na liście rozbity na Niewysłane/Oczekuje/Wygasłe wg `sent_at` i `expires_at <= NOW()` (liczone w SQL).
- Panel `/dashboard/admin/invitations` (ADMIN + STAFF, link w sidebarze i na liście architektów): wklejenie listy „email, imię i nazwisko, pracownia” (lub CSV/kolumny z arkusza; parser w `src/lib/invitations.ts` rozpoznaje email po `@`, format `Nazwa <email>`, nagłówek), podgląd z oznaczeniem „ma konto / już zaproszony / błąd”, „Utwórz i wyślij”.
- Wysyłka partiami po 20 przez `sendInvitations` z paskiem postępu w kliencie (kilkaset maili nie blokuje jednego żądania); wynik per adres, `last_error` na wierszu; akcje: Wyślij ponownie (przedłuża ważność, wygasłe dostają nowy token), Kopiuj link (na żądanie, token nie trafia do listy), Anuluj (InlineConfirm); zbiorczo „Wyślij niewysłane” i „Odnów wygasłe”.
- Publiczna strona `/auth/invite?token=` + `POST /api/auth/accept-invitation` (rate limit per IP, transakcja z `FOR UPDATE`, token jednorazowy): zaproszony uzupełnia imię i nazwisko, pracownię, hasło (polityka haseł), akceptuje regulamin; konto `ARCHI` z `must_change_password = 0`, od razu zalogowany. Stany linku: nieprawidłowy / wykorzystany / anulowany / wygasły.
- Audyt: `INVITATIONS_CREATED`, `INVITATIONS_SENT`, `INVITATION_REVOKED`, `INVITATION_ACCEPTED` w `activity_logs`; tagi `{{invite_link}}`, `{{expires_at}}` dodane do listy w edytorze szablonów i do maila testowego; sekcja w `docs/help/admin.md`.
- Weryfikacja: `tests/invitations.test.ts` (11 testów), razem 102/102; `tsc` czysty w `src/`; `next build` OK; test E2E w przeglądarce na dev (Node 25: `/opt/homebrew/opt/node@25/bin/node`, bo better-sqlite3 nie ładuje się pod Node 26): utworzenie → wysyłka (log maila w dev) → anulowanie → aktywacja konta i auto-logowanie → ponowne użycie linku odrzucone. Dane testowe usunięte z `dev.sqlite`.
- Do zrobienia przed użyciem na produkcji: deploy uruchomi `ensure-production-schema` automatycznie; sprawdzić treść szablonu `ARCHITECT_INVITED` w Ustawienia → Szablony email i wysłać mail testowy; `NEXTAUTH_URL` musi wskazywać na `https://archi.walldecor.pl` (z niego budowany jest link).

## 2026-10-22 — Deploy na produkcję i smoke test

- PR #3 zmergowany do `main` (merge commit `c3958e7`), deploy przez Coolify (app `walldecor-portal`, nixpacks, `https://archi.walldecor.pl`), build ok, `ensure-production-schema` bez zmian schematu.
- Portal stoi na Coolify, nie na PM2/nginx — `DEPLOY-P1-CHECKLIST.md` i `deploy/` są nieaktualne; merge do `main` nie deployuje sam, trigger przez API (`GET /api/v1/deploy?uuid=...`).
- Backup przed deployem: utworzony harmonogram backupu MySQL w Coolify (codziennie 03:00, `walldecor_prod`) + `backup_now`; wcześniej nie było żadnego backupu.
- Smoke test ADMIN (tylko odczyt, dane produkcyjne): dashboard, lista architektów, profile, strona projektu z wnioskiem o wypłatę (T7), ustawienia zespołu i emaili, `/api/admin/backup` (200, JSON) — bez błędów w konsoli.
- Nagłówki bezpieczeństwa live (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy); `/api/admin/pipeline` → 404; regulamin w wersji 1.1.
- Mobile 390 px (emulacja CDP): logowanie, reset hasła, regulamin bez poziomego przewijania. Widoki za logowaniem na mobile nie sprawdzone (brak możliwości zmniejszenia okna w rozszerzeniu Chrome).
- Nie testowane: logowanie STAFF i ARCHI (brak kont testowych), żadne akcje zapisu/wypłat.
- Obserwacja: istniejące prowizje mają stawkę 7% (stary program); PENDING przeliczy się na nową stawkę przy finalizacji (`projects.ts`, UPDATE PENDING→EARNED z nowym `rate`). Prowizja IN_PAYMENT nie wlicza się do kafelków „EARNED/PENDING” na stronie projektu admina — drobna niespójność UX.

## 2026-10-23 — Redesign Portalu Architekta (kierunek jasny, redakcyjny)

- Design system v0.2 w `docs/design-system.html` (artefakt Claude + Superset Page) — źródło prawdy: tokeny `--wd-*`, Fraunces / Hanken Grotesk / IBM Plex Mono, oryginalne logo (`public/walldecor-logo-dark.png` na jasnym tle), jeden mosiężny akcent, statusy po polsku.
- Plan i tickety w `PLAN-REDESIGN-2026-10-22.md`: T-R1 fundamenty (tokeny w `globals.css`, fonty przez `@fontsource`, prymitywy `src/components/ui/*`, jasny Sidebar/MobileNav/ShellHeader), T-R2…T-R6 strony (admin, architekci, projekt, strona architekta, auth/regulamin/pomoc/ustawienia), T-R7 sprzątanie. Wykonane przez subagentów Sonnet, przegląd i weryfikacja: orkiestrator.
- Konwencje: `Button`/`StatusPill`/`KpiTile`/`Card`/`Banner`/`InlineConfirm` zamiast własnych klas; `formatPLN`/`formatSignedPLN`/`formatDate` z `@/components/ui` (grupowanie tysięcy zawsze); jeden przycisk primary na ekran; `.label-caps` to jedyne miejsce na wielkie litery; tytuł powłoki z `src/lib/shellTitle.ts` wg ścieżki; strony nie renderują własnego h1.
- Usunięte aliasy starych tokenów (`brand-*`, `gold-*`, `stat-card`, `glass-panel`) — nowy kod ma używać wyłącznie tokenów z design systemu.
- Lokalny podgląd: `scripts/seed-dev.mjs` tworzy `dev.sqlite` z kontami testowymi (dane w nagłówku skryptu), `.env.local` z `DB_TYPE=sqlite`; natywny `better-sqlite3` buduje się tylko pod Node 25 (`PATH=/opt/homebrew/opt/node@25/bin:$PATH`).
- Weryfikacja: 91/91 testów (+2 nowe pliki), tsc czysto, `next build` OK, 0 klas legacy, 0 `alert/confirm`, 0 `toLocale*` bez `pl-PL`; szerokość 390 px bez przewijania na 12 stronach (pomiar przez CDP); zrzuty desktop ADMIN i ARCHI obejrzane, 0 błędów konsoli.
- Zmiany logiki przy okazji (świadome): potwierdzenie inline przy „Oznacz jako opłacone” i zmianie roli w zespole; kafelek „Aktywne projekty” architekta liczy tylko projekty w toku; podgląd szablonu email bez `dangerouslySetInnerHTML`.
- Otwarte: brak wspólnego prymitywu modala (trzy modale dublują obsługę Esc); kafelek cashback na stronie projektu liczony ze stawki, nie z `wallet_transactions`; `AddArchitectButton` i `RegisterArchitectButton` to dwa podobne komponenty do scalenia; Google OAuth + magic link do osobnego ticketu.

## 2026-10-23 — Deploy redesignu na produkcję

- PR #4 zmergowany do `main` (merge commit `d050612`), deploy przez Coolify (deployment `ngc4c44gowgoo80osg4o4ggg`, status `finished`, ok. 8 min łącznie z kolejką).
- Backup MySQL przed deployem potwierdzony w `GET …/backups/<id>/executions` (05:09 UTC, `success`); nocny backup z 03:00 też się wykonał. Odpowiedź PATCH `backup_now` mówi tylko „configuration updated” — stan sprawdzać przez `executions`.
- Smoke test ADMIN na produkcji (tylko odczyt): dashboard, architekci, profil partnera, strona projektu z rozliczeniem prowizji i plikami, ustawienia zespołu i emaili, pomoc, regulamin — nowy wygląd live, logo oryginalne, 0 błędów konsoli.
- Logowanie i regulamin sprawdzone przy 390 px (CDP) bez poziomego przewijania; `/walldecor-logo-dark.png` 200; brak `fonts.googleapis` w HTML; nagłówki bezpieczeństwa bez zmian; `/api/admin/pipeline` 404.
- Nie testowane na produkcji: logowanie STAFF/ARCHI, widoki architekta za logowaniem, akcje zapisu.

## 2026-10-29 — Integracja Subiekt GT → portal (plan)

- Zbadano wykonalność: Subiekt GT (bez Sfery, odczyt MS SQL tylko do czytania) → agent na PC z bazą → endpoint portalu; Twenty CRM v2.9.0 na crm.walldecor.pl zostaje osobnym projektem.
- Decyzje biznesowe potwierdzone z właścicielem: prowizja tylko z FS/KFS; ZK = projekt (z opcją łączenia projektów); pozycja jednorazowa = montaż; statusy tylko podpowiadane; pozycje z Subiekta bez edycji ręcznej; sync raz dziennie; zmiany ZK logowane jako snapshoty.
- Portal nie ma dziś żadnego wejścia maszynowego (wszystkie route handlery i server actions wymagają sesji); logika pozycji/prowizji zaszyta w `actions/projects.ts` — loop 0 planu wydziela ją do `src/lib/projectItems.ts`.
- Plan: `PLAN-SUBIEKT-2026-10-29.md` (8 loopów z DoD wg zachowania użytkownika, bramka testy+tsc+build+walidator, checklist audytu atrap). `CLAUDE.md` przełączony z trybu audytu na to zadanie.
- Do weryfikacji w biurze przed loopem 5: pola własne na ZK/FS w GT, wartości `dok_Typ`, kolumna powiązań dokumentów. Uwagi kopiują się z ZK na FS (potwierdzone) — plan B dla znacznika architekta.

## 2026-10-29 — Subiekt loop 0: rdzeń pozycji i prowizji (`src/lib/projectItems.ts`)

- Logika `addProjectItem` / `updateProjectItem` / `deleteProjectItem` przeniesiona 1:1 do `addItemCore` / `updateItemAmountCore` / `deleteItemCore` (wraz z `getArchitectCommissionRate`, `getProjectCommissionRate`); akcje to wrappery: sesja ADMIN → rdzeń → `revalidatePath`. Zachowanie panelu bez zmian.
- Rdzeń nie jest plikiem `'use server'` (nie może być wywołany z klienta), nie importuje `next-auth` ani `next/cache`; autor jako `actor.actorId` (null = system), notatka jako `actor.note`.
- Transakcje re-entrant (`src/lib/db.ts`, `AsyncLocalStorage`): `withTransaction` wewnątrz aktywnej transakcji dołącza do niej (COMMIT/ROLLBACK robi najbardziej zewnętrzne wywołanie), a `query` w MySQL sam trafia na połączenie transakcji — także `logActivity`. Rdzeń nie ma parametru `queryFn`; wszystkie trzy funkcje są atomowe (pozycja + prowizja + cashback + log), więc sync Subiekta może je wołać w swojej transakcji.
- Rdzeń zwraca dane do odświeżenia widoków: `updateItemAmountCore` → `{ projectId }`, `deleteItemCore` → `{ projectId, status } | null`; wrappery nie robią już własnych SELECT-ów.
- Migracja `019_subiekt_integration.sql` (na razie tylko `project_items.source/subiekt_document_id/subiekt_position_id`), kolumny dodane też do `ensure-production-schema.mjs` i `seed-dev.mjs`. Akcja admina zawsze zapisuje `source = 'MANUAL'`.
- Testy integracyjne na prawdziwym SQLite: `tests/helpers/sqliteTestDb.ts` (schemat z bloku `// SCHEMA-START`…`// SCHEMA-END` w `seed-dev.mjs`) + `tests/helpers/srcResolveHooks.ts` (hook Node mapujący `@/…` i importy bez rozszerzenia na `.ts`). `npm test` = `node --test "tests/*.test.ts"` (glob rozwija Node; katalog `tests/` jako argument nie działa); uruchamiać pod Node 25 (natywny `better-sqlite3`).
- Testy źródłowe (`commissionCorrections`, `commissionConsistency`, `accountValidation`) czytają teraz rdzeń, asercje zachowane.
- `updateProjectStatus` nietknięty — nadal ma 2× `INSERT INTO commissions` (finalizacja i PENDING przy akceptacji), więc walidator planu `grep -c` daje 2, nie 0.

## 2026-10-29 — Subiekt loop 1: endpoint synchronizacji, tabele pośrednie, run tracking

- Migracja 019 uzupełniona o resztę schematu z planu 2.2 (`users.subiekt_code` + unikalny indeks, `project_items.type_overridden`, `subiekt_documents`, `subiekt_document_snapshots`, `subiekt_sync_run_pages`, `subiekt_sync_runs`); to samo w `seed-dev.mjs` (blok SCHEMA zawiera teraz też `CREATE INDEX`) i `ensure-production-schema.mjs` (nowa lista `requiredIndexes` sprawdzana po `information_schema.STATISTICS`).
- `src/lib/subiekt/sync.ts` → `processSyncPage`: run upsert poza transakcjami, **jedna `withTransaction` na dokument**, błąd dokumentu → `rejected` z `INTERNAL_ERROR:<msg>`, reszta strony idzie dalej. Bez mapowania: każdy dokument `UNASSIGNED` / `MAPPING_NOT_ENABLED`, więc `unassigned = accepted + unchanged`.
- Hash równy → tylko `last_seen_at`, `last_run_id`, `is_paid` (bez snapshotu); hash różny → pełny UPDATE + snapshot. Id: `sd_`/`ss_` + 12 hex, run = `run_id` agenta.
- `processSyncPage` trzeba wołać poza transakcją — w środku zewnętrznej transakcji izolacja per dokument nie działa (brak savepointów, zasada opisana w `db.ts`).
- Endpointy `POST /api/integrations/subiekt/sync` i `GET …/status` (podpis z pustego body); wspólna bramka `src/lib/subiekt/http.ts` (limit 60/10 min per IP, token + HMAC, 503 po polsku). Zwracają `Response.json` zamiast `NextResponse`, żeby route'y dało się testować w `node:test` (ESM nie rozwiązuje `next/server` bez `.js`).
- `db.ts`: komentarz o braku savepointów, zwolnienie połączenia MySQL przy błędzie `beginTransaction`, `console.warn` przy `query` z wygaszonego kontekstu transakcji.
- Testy: `tests/subiektSync.test.ts` (16 — idempotencja, zmiana ilości, `is_paid`, 2 strony, powtórka strony, błąd constraintu, walidacja per dokument, rollback zewnętrznej transakcji, zagubiony callback, route'y 200/401/400/413/429/503). `npm test` 171/171, tsc tylko 18× TS5097, `next build` OK.
- Walidator curl z planu: 200 `accepted:1, unassigned:1` → 200 `unchanged:1` → 401 `BAD_TOKEN`; `5001|ZK|UNASSIGNED`; po restarcie bez env 503 i wiersz nadal jest (przed poprawką powtórki run pokazywał 2/1 stron — teraz test odtwarza ten scenariusz i daje 1/1).
- Powtórka strony (retry agenta z tym samym `run_id` + `page`): tabela `subiekt_sync_run_pages (run_id, page)`; dokumenty przetwarzane ponownie (idempotentnie → `unchanged`), ale `pages_received = COUNT(*)` różnych stron, więc run nie zamyka się przedwcześnie; liczniki dokumentów sumują się też dla powtórki, `finished_at` = pierwsze zamknięcie. Insert strony/runu: SELECT → INSERT, duplikat klucza w wyścigu rozpoznany ponownym SELECT-em.
- Po review: walidacja per dokument — koperta (`run_id`, `page/pages`, `documents[]`, limit 200) nadal odrzuca całe żądanie (`code`: `INVALID_ENVELOPE` → 400, `TOO_MANY_DOCUMENTS` → 413), a zły dokument trafia do `rejected` jako `VALIDATION:<ścieżka względem dokumentu>: …` (niepoprawne `external_id` → 0 + `documents[i]`) i reszta strony się zapisuje. Hash z wersją (`HASH_VERSION = 1` w kanonicznym JSON-ie; podbicie = nowy snapshot każdego dokumentu). Ponadto: nieliczbowy `SUBIEKT_SYNC_MAX_SKEW_SECONDS` → 300 s, `/status` zwraca daty ISO i liczniki jako liczby na obu silnikach, `getClientIp` wspólny w `rateLimit.ts`.

## 2026-10-29 — Subiekt loop 2A: czyste mapowanie + kod architekta w adminie

- `src/lib/subiekt/mapping.ts` (bez DB, tylko `import type`): `resolveArchitectCode`, `sortDocumentsForProcessing`, `resolveRoot` (limit 32 kroków = łańcuch urwany), `positionToItemType`, `buildItemInput`, `leadingDocType`, `createsItems`; testy w `tests/subiektMapping.test.ts` (bez hooka rozwiązywania modułów).
- `updateArchitectAdminFields(id, { tier_override?, subiekt_code? })`: pole pominięte nie jest zmieniane; kod = trim + uppercase, `[A-Z0-9_-]{1,64}`, pusty → `NULL`, zajęty przez innego → „Ten kod ma już inny architekt.”; zmiana logowana jako `ARCHITECT_SUBIEKT_CODE`.
- Pole „Kod w Subiekcie” w `EditArchitectModal` (zapisuje się osobnym wywołaniem akcji admina PRZED `updateArchitect`, żeby błąd kodu nie zostawiał częściowo zapisanego profilu); na profilu architekta (`ArchitectDataCard`) kod jest tylko do odczytu.
- Testy akcji są źródłowe (akcja wymaga sesji next-auth); uniqueness opiera się też o unikalny indeks `idx_users_subiekt_code`.

## 2026-10-29 — Subiekt loop 2B: mapowanie dokumentów na architekta, projekt i pozycje

- `sync.ts` → `processDocument(doc, runId)`: jedna `withTransaction` na dokument = upsert (Loop 1) + mapowanie (`src/lib/subiekt/mappingDb.ts`); błąd wycofuje cały dokument łącznie z upsertem. Strona sortowana `sortDocumentsForProcessing`; `unassigned` = dokumenty z końcowym `UNASSIGNED`.
- Mapowanie pomija `MANUAL`/`IGNORED`; działa dla INSERTED/CHANGED i dla UNCHANGED+UNASSIGNED (rodzic/kod może dojść później). UNCHANGED+AUTO: tylko odświeżenie `is_paid` pozycji (zapłata nie wchodzi do hasha).
- Powody: `NO_ARCHITECT` (też przy nieznanym rodzicu bez kodu), `UNKNOWN_ARCHITECT_CODE:<kod>`, `NO_ROOT_DOCUMENT` (korzeń nieznany albo nie ZK/FP), `ROOT_UNASSIGNED`, `PROJECT_CANCELLED`, `UNMATCHED_CORRECTION`. `root_external_id` zapisywany także dla nieprzypisanych; dokument nigdy nie traci `project_id` automatycznie.
- Projekt `p_` + 8 hex, `PRZYJĘTY`, nazwa „kontrahent — numer” (≤ 200 zn.), log `SUBIEKT_PROJECT_CREATED`. Rozjazd architekta dokumentu i właściciela projektu → tylko `console.warn` (bez przenoszenia).
- Pozycje tylko przez rdzeń `projectItems.ts`; łańcuch = dokumenty korzenia w projekcie (AUTO/MANUAL + bieżący). Pierwsza FS usuwa pozycje ZK; FS MANUAL zostawione loopowi 4. Typ istniejącej pozycji się nie zmienia (override admina zachowany). Kwota ≤ 0 → brak pozycji / `deleteItemCore`; zerowa pozycja w ZAKOŃCZONY nie jest „usuwana” co sync.
- Po review: KFS = widok pochodny — cel korekty sprawdzany w `positions_json` przypisanych FS projektu (nie w `project_items`; wszystko albo nic, inaczej `UNMATCHED_CORRECTION`), mapa korekt = wszystkie AUTO/MANUAL KFS projektu (późniejsza wg `issued_at`, `external_id` wygrywa), stosowana przy każdym resyncu FS (0 → pozycja usunięta). Reguła MANUAL: admin decyduje o przypisaniu, Subiekt o treści (pozycje resync przy INSERTED/CHANGED); IGNORED pomijany. Inny architekt niż właściciel projektu → `OWNER_MISMATCH:<kod>` (bez projektu: UNASSIGNED; w projekcie: status bez zmian + `SUBIEKT_OWNER_MISMATCH` w logu). Eksport dla loopu 4: `syncChainItems(id)`, `remapDocument(id)`; `architect_code` = tylko własny kod dokumentu.
- Poprawka rdzenia: `addItemCore` nie tworzy już PENDING dla INSTALLATION (zgodnie z `updateItemAmountCore` i rozliczeniem projektu).
- `status.ts`: `computeSuggestedStatus`, `getProjectSubiektSummary` (fsTotal = FS + KFS). Testy `tests/subiektMappingSync.test.ts` (26, m.in. idempotencja strony ×3), kwoty z payloadu zaokrąglane do 2 miejsc; walidator curl na dev.sqlite (`u_kamila` = A-001) OK.

## 2026-10-29 — Subiekt loop 3: log zmian ZK/FP, blokada edycji pozycji z Subiekta

- `src/lib/subiekt/diff.ts`: `diffPositions` (po `external_id`; kolejność wg `ordinal` next, potem REMOVED wg prev; NAME → QUANTITY → PRICE) i `formatDiffForLog` wg kontraktu 2.5. ADDED/REMOVED niosą wartość netto pozycji w `after`/`before`, QUANTITY/PRICE opis `"10 szt × 120,00"`.
- Kwoty przez nowe `formatPLNFixed` w `src/lib/utils.ts` (2 miejsca, grupowanie także 4-cyfrowych): separator tysięcy to twarda spacja U+00A0, przykład z planu zgadza się po zamianie NBSP na spację. `formatPLN` z utils daje "14 300" i "1200".
- `sync.ts`: CHANGED + ZK/FP → `SUBIEKT_ZK_CHANGED` (`user_id` NULL) w transakcji dokumentu, po mapowaniu. Poprzednia treść = `positions_json`/`net_total` wiersza sprzed UPDATE (created_at snapshotu ma rozdzielczość sekundy); uszkodzony JSON → brak wpisu + `console.warn`; same uwagi → brak wpisu.
- Migracja 020: `activity_logs.subject_id` + indeks `(event_type, subject_id)` (też seed-dev i ensure-production-schema). `logActivity(..., subjectId?)`; wpisy `SUBIEKT_ZK_CHANGED`/`PROJECT_CREATED`/`OWNER_MISMATCH` mają subject = `subiekt_documents.id`. Historia projektu = wpisy dokumentów, które teraz są w projekcie (zmiana sprzed przypisania pojawia się po przypisaniu); `metadata.projectId` tylko informacyjnie.
- Blokada: `assertManualItem` (jeden SELECT `project_id, source`) w `updateProjectItem`, `deleteProjectItem`, `updateProjectItemMeta`; rdzeń `projectItems.ts` bez zmian (sync go używa).
- UI: admin `ItemRow` — pozycja SUBIEKT bez akcji, badge „Subiekt · <FV lub ZK>”; `SubiektChangesCard` („Zmiany zamówienia (Subiekt)”, data i godzina Europe/Warsaw przez nowe `formatDateTime`, autor „Subiekt (synchronizacja)”) u admina i architekta, bez wpisów nic.
- Globalnego Activity Feed admina nie ma (usunięty w 703bcbb); `getAdminActivity` bez zmian (martwy).
- Testy: `subiektDiff` (10), `subiektZkDiffSync` (9, w tym rollback i subject_id), `subiektManualLock` (5, źródłowy).

## 2026-10-29 — Subiekt loop 4A: operacje admina (backend) i widoki do panelu

- `src/lib/subiekt/adminOps.ts` (bez sesji, jedna `withTransaction` na operację, testowalne): `assignDocumentToProjectOp`, `createProjectFromDocumentOp`, `ignoreDocumentOp`, `mergeProjectsOp`, `moveDocumentToProjectOp`, `overrideItemTypeOp`, `nextStatusSteps`; akcje w `src/app/actions/subiekt.ts` = sesja + uprawnienie + operacja + `revalidatePath` (przypisz/utwórz/ignoruj/zastosuj status: ADMIN|STAFF; połącz/przenieś/typ pozycji: ADMIN).
- Przypisanie / przeniesienie łańcucha (`reassignChain`): pozycje przenoszonych dokumentów znikają ze starych projektów (`chainOps.ts`: `clearChainItems`, `clearDocumentItems` — w ZAKOŃCZONY korekta do 0 + odpięcie wiersza), wskazany dokument, korzeń i przypisane dokumenty łańcucha → MANUAL, nieprzypisane dokumenty łańcucha przechodzą zwykłe reguły (`remapDocument`), IGNORED zostają. Korzeń innego architekta blokuje przeniesienie całego łańcucha; KFS przypisywana ręcznie musi pasować do faktur projektu.
- `mappingDb.ts`: pozycje dokumentu czytane zawsze w jego bieżącym projekcie; KFS resynchronizuje wszystkie FS projektu (zmiana celu zdejmuje starą korektę), a KFS, która wypadła z mapy (np. UNMATCHED_CORRECTION), resynchronizuje faktury; eksport `insertProjectForDocument`, `resyncProjectInvoices`, `kfsMatchesProject`, `syncChainItems(id, actor?)`.
- Łączenie projektów: ten sam architekt, bez ZAKOŃCZONY/NIEZREALIZOWANY, ZGŁOSZONY tylko jako cel dla zgłoszonych; przenosi dokumenty, pozycje, prowizje (bez zmian kwot), pliki i `wallet_transactions.reference_id`; pozycje ze zgłoszonych źródeł dostają PENDING przez rdzeń; pozycje MANUAL zostają.
- Zmiana typu pozycji = `deleteItemCore` + `addItemCore` (nowe id pozycji, `type_overridden = 1`); `applySuggestedStatus` idzie krokami przez istniejące `updateProjectStatus` (kroki nie są jedną transakcją).
- `queries.ts`: `getRecentSyncRuns`, `getUnassignedDocuments` (z `candidateProjects`), `getUnknownArchitectCodes`, `getUnassignedCount`, `getProjectSubiektDocuments` (łańcuchy; `root` = null, gdy korzeń jest poza projektem), `getMergeCandidates`.
- Testy: `subiektChainOps` (6), `subiektAdminOps` (20), `subiektAdminQueries` (6), `subiektAdminGuards` (12, źródłowy); `npm test` 279/279, tsc bez nowych błędów (19× TS5097), `next build` OK, brak `INSERT INTO commissions` w `src/lib/subiekt/` i akcjach Subiekta.
