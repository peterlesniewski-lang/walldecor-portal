# Loop 4b — tryb wewnętrzny, kody architektów, ważność cashbacku — DOWÓD (2026-10-30)

Plan: `PLAN-SUBIEKT-2026-10-29.md`, sekcja „Loop 4b”. Gałąź `subiekt/loop-4b-internal-mode`.

**Wynik:** zakres 1–5 zrobiony; testy, tsc, build i e2e zielone. Odstępstwa i uwagi na końcu.

## Commity

| SHA | Temat |
|---|---|
| `b9934e3` | feat(cashback): configurable cashback expiry via CASHBACK_EXPIRY_MONTHS |
| `aafd8de` | feat(subiekt): automatic architect codes A-001…, code column and search on architects list |
| `77e4521` | feat(auth): internal mode PORTAL_INTERNAL_MODE for team-only launch |

## Bramka

```
$ npm test
ℹ tests 329
ℹ pass 329
ℹ fail 0
(przed loopem 303; +26: subiektCodes 11, internalMode 9, cashbackExpiry 5, subiektAdminGuards +1)

$ npx tsc --noEmit | grep -oE "error TS[0-9]+" | sort | uniq -c
  19 error TS5097

$ npm run build
✓ Compiled successfully in 2.2s
  Finished TypeScript in 2.2s ...
✓ Generating static pages using 14 workers (23/23) in 149ms
(exit 0; jedyne ostrzeżenie Turbopack „unexpected file in NFT list” dla api/projects/[projectId]/files — istniało wcześniej)

$ grep -rn "INSERT INTO commissions" src/ --include='*.ts' | cut -d: -f1 | sort | uniq -c
   1 src/app/actions/import.ts
   2 src/app/actions/projects.ts     (updateProjectStatus, jak na main)
   4 src/lib/projectItems.ts
```

Testy pisane przed implementacją (TDD): trzy nowe pliki padały na `ERR_MODULE_NOT_FOUND` (`codes.ts`, `internalMode.ts`, `cashbackExpiry.ts`) przed pierwszym commitem kodu.

Nowe testy (`node --test tests/subiektCodes.test.ts tests/internalMode.test.ts tests/cashbackExpiry.test.ts`):

```
✔ cashbackExpiresAt defaults to 12 months without the variable (1.1375ms)
✔ cashbackExpiresAt honours CASHBACK_EXPIRY_MONTHS=24 and =12 (0.070667ms)
✔ cashbackExpiresAt falls back to 12 months with a warning for garbage, zero or negative values (0.938209ms)
✔ new EARN row from a settled project item expires 24 months ahead with CASHBACK_EXPIRY_MONTHS=24 (2.673542ms)
✔ no hard-coded one-year expiry left in the three cashback write paths (2.944458ms)
✔ isInternalMode accepts 1 / true only (0.595292ms)
✔ sendEmail in internal mode skips ARCHI and unknown addresses without sending (1.111125ms)
✔ sendEmail in internal mode sends to STAFF and ADMIN (0.299666ms)
✔ sendEmail without the variable sends to ARCHI and unknown addresses as before (0.13075ms)
✔ forgot-password in internal mode: ARCHI gets the same answer as an unknown address, no token (3.643416ms)
✔ forgot-password without the variable creates a token for ARCHI as before (0.734542ms)
✔ authorize in internal mode refuses ARCHI with the preparation message, admits STAFF and ADMIN (4.98125ms)
✔ authorize without the variable admits ARCHI as before (1.259209ms)
✔ sign-in page shows the preparation message; Google sign-in and shell badge follow the mode (0.631334ms)
✔ nextSubiektCode: empty database → A-001 (1.149916ms)
✔ nextSubiektCode: existing A-001 and A-003 → A-004 (largest number + 1, gaps not reused) (1.430375ms)
✔ nextSubiektCode: manual A-1200 → A-1201; after A-999 comes A-1000 (1.271958ms)
✔ nextSubiektCode: codes outside ^A-(\d+)$ are ignored (1.647125ms)
✔ formatSubiektCode pads to 3 digits and generated codes pass the edit-modal format (0.133333ms)
✔ assignMissingSubiektCodesOp: only architects without a code, ordered by created_at then name, logged (2.675708ms)
✔ assignMissingSubiektCodes action: ADMIN gets { ok, assigned }, STAFF is refused (1.541458ms)
✔ CSV import: auto-registered architect gets the next code (50.838834ms)
✔ registerArchitect (admin/STAFF registration): new architect gets the next code (49.134083ms)
✔ accept-invitation: ARCHI account gets the next code, STAFF account none (380.552625ms)
✔ architects list: "Kod" column, search by code, button only for ADMIN with missing codes (0.869375ms)
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

Server actions (`importProjectsFromCSV`, `registerArchitect`, `assignMissingSubiektCodes`) i trasy (`accept-invitation`, `forgot-password`) testowane bezpośrednio na SQLite: `tests/helpers/nextServerStubs.ts` podmienia w `node --test` moduły `next-auth` (sesja z testu), `next/cache` i `@/lib/auth` (providery next-auth nie ładują się jako ESM). `authorize` wydzielony do `src/lib/authorizeCredentials.ts`, żeby testować go bez next-auth.

## E2E (Playwright, headless Chromium, `next start` z buildu produkcyjnego)

- Baza: `DB_PATH=<scratchpad>/loop4b/e2e.sqlite node scripts/seed-dev.mjs` (świeża, `dev.sqlite` nietknięty). Seed: 3 architektów bez kodu (Kamila 200 dni temu, Marcin 120, Aleksandra 90).
- Faza A: `DB_TYPE=sqlite DB_PATH=… NEXTAUTH_URL=http://localhost:3601 NEXTAUTH_SECRET=… npx next start -p 3601` (bez nowych zmiennych).
- Faza B: restart tego samego serwera z `PORTAL_INTERNAL_MODE=1 CASHBACK_EXPIRY_MONTHS=24` na tej samej bazie (restart = sprawdzenie trwałości).
- Skrypt: `<scratchpad>/loop4b/e2e.mjs` (logowanie formularzem, kliknięcia, odczyt bazy tylko do asercji; zero ręcznych zapisów do bazy).

Faza A (bez zmiennych):

```
PASS A1 kolumna „Kod” w tabeli — ARCHITEKT, KOD, EMAIL, STATUS, PROJEKTY, OBRÓT, PORTFEL, Akcje
PASS A1 kody puste („—”) przed nadaniem — ["Aleksandra Bodecka | —","Kamila Wiśniewska | —","Marcin Czubaszek | —"]
PASS A1 przycisk „Nadaj brakujące kody (3)” widoczny — Nadaj brakujące kody (3)
PASS A1 brak plakietki trybu wewnętrznego bez zmiennej
PASS A2 „A-00” przed nadaniem → brak wyników
PASS A3 przycisk znika po kliknięciu
PASS A3 kody na liście — ["Aleksandra Bodecka | A-003","Kamila Wiśniewska | A-001","Marcin Czubaszek | A-002"]
PASS A3 kody w bazie (kolejność created_at) — [{"name":"Kamila Wiśniewska","subiekt_code":"A-001"},{"name":"Marcin Czubaszek","subiekt_code":"A-002"},{"name":"Aleksandra Bodecka","subiekt_code":"A-003"}]
PASS A3 wpis SUBIEKT_CODES_ASSIGNED — [["u_admin","Nadano kody Subiekt 3 architektom (A-001 … A-003)"]]
PASS A4 „A-00” → 3 architektów — ["Aleksandra Bodecka | A-003","Kamila Wiśniewska | A-001","Marcin Czubaszek | A-002"]
PASS A4 „A-002” → tylko Marcin — ["Marcin Czubaszek | A-002"]
PASS A5 STAFF: nazwisko → wiersz z kodem A-001 — ["Kamila Wiśniewska | A-001"]
PASS A5 STAFF: brak przycisku „Nadaj brakujące kody”
PASS A6 kamila bez trybu wewnętrznego → /dashboard — http://localhost:3601/dashboard
console errors: 0
RESULT phase A: 14/14 passed
```

Faza B (`PORTAL_INTERNAL_MODE=1`, `CASHBACK_EXPIRY_MONTHS=24`, po restarcie):

```
PASS B1 admin zalogowany w trybie wewnętrznym — http://localhost:3601/dashboard/admin/architects
PASS B1 plakietka „Tryb wewnętrzny” widoczna
PASS B1 kody po restarcie — ["Aleksandra Bodecka | A-003","Kamila Wiśniewska | A-001","Marcin Czubaszek | A-002"]
PASS B1 przycisk „Nadaj brakujące kody” nadal ukryty
FAIL B2 nowy architekt z kodem A-004
FAIL B2 lista: „A-004” → Nowa Testowa — []
PASS B3 projekt ZAKOŃCZONY, EARN wygasa za 24 mies. — {"status":"ZAKOŃCZONY","earn":{"id":"t_i_kowalska_1_cashback","amount":100,"expires_at":"2028-10-30 15:05:35","created_at":"2026-10-30 14:05:35"},"expectedApprox":"Mon Oct 30 2028 15:05:37 GMT+0100 (Central European Standard Time)"}
PASS B4 kamila: komunikat o przygotowaniu
PASS B4 kamila zostaje na /auth/signin — http://localhost:3601/auth/signin
PASS B4 brak ogólnego „Błędny email lub hasło”
PASS B4 brak sesji architekta — {}
PASS B4 złe hasło → „Błędny email lub hasło”
PASS B5 odpowiedź ARCHI = nieistniejący adres — ARCHI: 200 {"ok":true} | brak: 200 {"ok":true} | STAFF: 200 {"ok":true}
PASS B5 tokeny: ARCHI 0, STAFF 1 — [{"email":"kamila@dev.local","n":0},{"email":"marcin@dev.local","n":0},{"email":"zespol@dev.local","n":1}]
PASS B6 STAFF zalogowany, plakietka widoczna — http://localhost:3601/dashboard/admin
console errors: 2
  kamila@dev.local: Failed to load resource: the server responded with a status of 401 (Unauthorized)
  kamila@dev.local: Failed to load resource: the server responded with a status of 401 (Unauthorized)
RESULT phase B: 13/15 passed
```

Krok B2 w pierwszym przebiegu fazy B padł z winy skryptu: modal „Zarejestruj architekta” wymaga pola „Hasło tymczasowe” (natywna walidacja przeglądarki „Please fill out this field”), skrypt go nie wypełniał — konto nie powstało. Po dopisaniu pola krok uruchomiony osobno na tym samym serwerze:

```
PASS B2 nowy architekt z kodem A-004 — {"name":"Nowa Testowa","role":"ARCHI","subiekt_code":"A-004"}
PASS B2 lista: „A-004” → Nowa Testowa — ["Nowa Testowa | A-004"]
console errors: 0
RESULT phase B2: 2/2 passed
```

Edycja kodu nadanego automatycznie (checklista §5 — zmiana w bazie, ręczny kod wygrywa):

```
PASS B7 modal pokazuje automatyczny kod A-001 — A-001
PASS B7 ręczna zmiana zapisana w bazie (A-050) — {"subiekt_code":"A-050"}
PASS B7 lista po edycji — ["Kamila Wiśniewska | A-050"]
console errors: 0
RESULT phase B3: 3/3 passed
```

Pierwszy przebieg fazy A miał 3 FAIL z winy selektora skryptu (pierwsza linia komórki to inicjały awatara „AB/KW/MC”, nie nazwisko); po poprawce selektora baza została zasiana od nowa i faza A przeszła 14/14 (wynik wyżej). „console errors: 2” w fazie B to odpowiedzi 401 z `/api/auth/callback/credentials` przy odmowie logowania architekta (oczekiwane).

Log serwera fazy B (fragment):

```
Failed to send email: Error: connect ECONNREFUSED ::1:587     ← reset hasła STAFF: mail dopuszczony, brak SMTP lokalnie
[internal-mode] pominięto mail ARCHITECT_REGISTERED do nowa.testowa@dev.local
```

Stan bazy po e2e (`sqlite3 -header -column e2e.sqlite …`):

```
name                role   subiekt_code  created_at
------------------  -----  ------------  -------------------
Anna Nowak          ADMIN                2025-09-25 08:15:00
Kamila Wiśniewska   ARCHI  A-050         2026-04-13 08:15:00   ← A-001 z „Nadaj brakujące kody”, potem ręcznie A-050
Marcin Czubaszek    ARCHI  A-002         2026-07-02 08:15:00
Aleksandra Bodecka  ARCHI  A-003         2026-08-01 08:15:00
Nowa Testowa        ARCHI  A-004         2026-10-30 14:05:56   ← rejestracja przez UI w trybie wewnętrznym
Tomasz Zieliński    STAFF                2026-01-03 09:15:00

event_type              user_id  description
----------------------  -------  --------------------------------------------------------
ARCHITECT_SUBIEKT_CODE  u_admin  Zmieniono kod Subiekt architekta u_kamila: A-001 → A-050
SUBIEKT_CODES_ASSIGNED  u_admin  Nadano kody Subiekt 3 architektom (A-001 … A-003)

id                       type  amount  created_at           expires_at
-----------------------  ----  ------  -------------------  -------------------
t_i_kowalska_1_cashback  EARN  100.0   2026-10-30 14:05:35  2028-10-30 15:05:35   ← 24 mies. (created_at UTC, expires_at czas lokalny — §6 pkt 11)

email                   role   tokens
----------------------  -----  ------
admin@dev.local         ADMIN  0
nowa.testowa@dev.local  ARCHI  0
kamila@dev.local        ARCHI  0
marcin@dev.local        ARCHI  0
ola@dev.local           ARCHI  0
zespol@dev.local        STAFF  1
```

Zrzuty (`<scratchpad>/loop4b/shots/`): `A1-admin-list-before` (kolumna Kod, „—”, przycisk „Nadaj brakujące kody (3)”), `A2-search-before`, `A3-admin-list-after`, `A4-search-A-002`, `A5-staff-search-name`, `B1-admin-internal-badge`, `B2-register-architect-result`, `B2b-search-A-004`, `B3-project-finished`, `B4-architect-login-refused`, `B5-forgot-password-architect`, `B6-staff-internal-badge`, `B7-edit-code`.

## Checklist audytu atrap (§5)

- [x] Kliknięte wszystkie nowe elementy: „Nadaj brakujące kody” (nadaje i znika), szukajka po kodzie (zawęża), kolumna „Kod” (dane z bazy), plakietka „Tryb wewnętrzny” (nieinteraktywna, tylko przy włączonej zmiennej), komunikat na ekranie logowania.
- [x] Edycja tego, co utworzone: kod A-001 zmieniony w modalu na `a-050` → w bazie `A-050`, log `ARCHITECT_SUBIEKT_CODE`.
- [x] Restart aplikacji (A → B): kody i log zostały.
- [n/d] Ta sama paczka dwa razy — loop nie dotyka synchronizacji.
- [n/d] Architekt A vs B — architekt w trybie wewnętrznym nie loguje się wcale; bez zmiennej logowanie bez zmian (A6).
- [x] STAFF: widzi kody i szuka po nazwisku (A5), nie widzi przycisku nadawania kodów (akcja tylko ADMIN, test `assignMissingSubiektCodes action … STAFF is refused`); operacje finansowe bez zmian.
- [x] `grep INSERT INTO commissions` — jak na main (wyżej).
- [x] Raport z komendami, wynikami i zrzutami.

## Odstępstwa i uwagi

- Logowanie Google: w trybie wewnętrznym callback `signIn` odmawia także architektowi z kontem Google (inaczej DoD „architekt nie zaloguje się” miałby obejście, gdy Google jest skonfigurowany). Odmowa daje standardowe przekierowanie NextAuth bez komunikatu o przygotowaniu.
- Istniejące sesje JWT architektów (zalogowanych przed włączeniem zmiennej) nie są unieważniane — tryb blokuje nowe logowania, nie wylogowuje. Do decyzji, jeśli na produkcji są aktywne sesje architektów.
- W trybie wewnętrznym wywołujący `sendEmail` widzą `success: false`: rejestracja architekta pokazuje „nie udało się wysłać maila powitalnego”, wysyłka zaproszeń liczy je jako nieudane (`last_error`) — zgodnie ze specyfikacją („traktują to jak dotąd”).
- `CASHBACK_EXPIRY_MONTHS` musi być liczbą całkowitą (np. `1.5` → 12 z ostrzeżeniem).
