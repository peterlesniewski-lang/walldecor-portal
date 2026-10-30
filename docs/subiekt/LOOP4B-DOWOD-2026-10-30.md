# Loop 4b — tryb wewnętrzny, kody architektów, ważność cashbacku — DOWÓD (2026-10-30)

Plan: `PLAN-SUBIEKT-2026-10-29.md`, sekcja „Loop 4b”. Gałąź `subiekt/loop-4b-internal-mode`.

**Wynik:** zakres 1–5 zrobiony; testy, tsc i build zielone. E2E zielone **po poprawkach skryptu i powtórzonych przebiegach** (faza A: pierwszy przebieg 11/14 przez błędny selektor, po poprawce i ponownym zasianiu bazy 14/14; faza B: 13/15, dwa kroki rejestracji powtórzone osobno 2/2 po dopisaniu wymaganego hasła w skrypcie) — szczegóły przy fazach. Po przeglądzie spec dodane poprawki i faza C, po przeglądzie jakości kolejne poprawki i faza D (sekcje „Poprawki po przeglądzie …” na końcu). Odstępstwa i uwagi przed nią.

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

Kroki **B7** — edycja kodu nadanego automatycznie (checklista §5 — zmiana w bazie, ręczny kod wygrywa). Osobny przebieg na tym samym serwerze fazy B, uruchomiony jako `e2e.mjs B3` — stąd „phase B3” w ostatniej linii; to nie jest krok B3 fazy B (cashback 24 mies.):

```
PASS B7 modal pokazuje automatyczny kod A-001 — A-001
PASS B7 ręczna zmiana zapisana w bazie (A-050) — {"subiekt_code":"A-050"}
PASS B7 lista po edycji — ["Kamila Wiśniewska | A-050"]
console errors: 0
RESULT phase B3: 3/3 passed      (= kroki B7, edycja kodu)
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
- ~~W trybie wewnętrznym wywołujący `sendEmail` widzą `success: false` (rejestracja: „nie udało się wysłać maila”, zaproszenia jako nieudane).~~ Naprawione po przeglądzie — patrz „Poprawki po przeglądzie spec”.
- `CASHBACK_EXPIRY_MONTHS` musi być liczbą całkowitą (np. `1.5` → 12 z ostrzeżeniem).

## Poprawki po przeglądzie spec (2026-10-30)

| SHA | Temat |
|---|---|
| `ce30253` | fix(auth): internal mode also refuses the DEMO_MODE architect |
| `a18e868` | fix(auth): keep the literal role type on the DEMO_MODE architect (tsc) |
| `81b2fd0` | fix(mail): internal-mode skips are reported as skipped, not as failures |

1. **DEMO_MODE:** demo-architekt (`architekt@demo.pl`) w trybie wewnętrznym dostaje ten sam komunikat co zwykły ARCHI (wspólne `refuseArchitectInInternalMode` w `src/lib/authorizeCredentials.ts`); demo-admin wchodzi.
2. **Pominięty mail ≠ błąd** (stałe i `isSkippedByInternalMode()` w `src/lib/internalMode.ts`):
   - `registerArchitect` → `emailSkipped: 'Mail powitalny pominięty (tryb wewnętrzny)'`, `emailError: null`; modal pokazuje baner info zamiast ostrzeżenia o nieudanej wysyłce.
   - `sendInvitations` / `resendInvitation` → nowe pole `skippedInternalMode` (nie wchodzi do `failed`), wiersz `{ ok: false, skippedInternalMode: true }`, `invitations.last_error = 'pominięto: tryb wewnętrzny'`, `sent_at` i `send_count` bez zmian. Panel: w postępie „Pominięte (tryb wewnętrzny): n” zamiast „Nieudane”, przy wierszu „Pominięto (tryb wewnętrzny)” zamiast „Błąd wysyłki”, „Wyślij” przy wierszu → komunikat info. Późniejsza udana wysyłka czyści `last_error` (jak dotąd).
   - Pozostali wywołujący `sendEmail`: `notifyArchitectProfileIncomplete` (przycisk w kolejce wypłat mówił „Wysłano”) → zwraca `skipped`, przycisk „Pominięto (tryb wewnętrzny)”; test maila z szablonu (`EmailsClient`, dotąd „Błąd wysyłki: Unknown error”) → komunikat info. Bez zmian, bo wynik tylko logowany / ignorowany: `import.ts` (ARCHITECT_REGISTERED), `projects.ts` (PROJECT_ADDED_*, PROJECT_ACCEPTED, PAYOUT_PROCESSED), `cashback.ts` (PAYOUT_REDEEMED_CARD), `forgot-password`.

Nowe testy (najpierw czerwone: 10 FAIL przed implementacją, potem zielone):

```
✔ authorize in internal mode refuses the DEMO_MODE architect too (0.142542ms)
✔ constants: welcome-mail and invitation notes for internal mode (0.544375ms)
✔ registerArchitect in internal mode reports the skipped welcome mail, not an error (51.613416ms)
✔ registerArchitect without the variable sends as before (no skip note) (48.13975ms)
✔ sendInvitations in internal mode: skipped, not failed; distinguishable last_error (10.6145ms)
✔ sendInvitations without the variable sends and clears the skip note (1.851584ms)
✔ invitations UI: skipped mails counted separately, row shows the internal-mode note, not "Błąd wysyłki" (0.6125ms)
✔ notifyArchitectProfileIncomplete reports the skip in internal mode (0.55475ms)
✔ test e-mail from template settings shows the internal-mode skip, not "Błąd wysyłki" (0.287292ms)
ℹ tests 19
ℹ pass 19
ℹ fail 0
```

### Bramka po poprawkach

```
$ npm test
ℹ tests 339
ℹ pass 339
ℹ fail 0
(329 → 339: internalMode +1 (DEMO_MODE), internalModeMailOutcomes 9)

$ npx tsc --noEmit | grep -oE "error TS[0-9]+" | sort | uniq -c
  19 error TS5097

$ npm run build
✓ Compiled successfully in 2.3s
  Finished TypeScript in 1939ms ...
✓ Generating static pages using 14 workers (23/23) in 150ms
(exit 0)
```

### E2E faza C (nowy build, `PORTAL_INTERNAL_MODE=1`, świeża baza z seed-dev + 2 zaproszenia PENDING wstawione jako dane startowe)

```
PASS C1 baner „Mail powitalny pominięty (tryb wewnętrzny)”
PASS C1 brak ostrzeżenia „mail powitalny nie został wysłany”
PASS C2 postęp: „Pominięte (tryb wewnętrzny): 2”, bez „Nieudane” — Wysyłka zakończona | 2 z 2 | Wysłane: 0 | Pominięte (tryb wewnętrzny): 2
PASS C2 wiersze: „Pominięto (tryb wewnętrzny)” ×2, brak „Błąd wysyłki”
PASS C2 baza: last_error „pominięto: tryb wewnętrzny”, sent_at puste — [{"id":"inv_c1","sent_at":null,"send_count":0,"last_error":"pominięto: tryb wewnętrzny"},{"id":"inv_c2","sent_at":null,"send_count":0,"last_error":"pominięto: tryb wewnętrzny"}]
PASS C3 „Wyślij” przy wierszu → komunikat o trybie wewnętrznym
console errors: 0
RESULT phase C: 6/6 passed
```

Log serwera: `[internal-mode] pominięto mail ARCHITECT_REGISTERED do ewa.pominieta@dev.local`, 3× `ARCHITECT_INVITED` (2 przy „Wyślij niewysłane”, 1 przy „Wyślij” w wierszu). Zrzuty: `C1-register-skipped-info`, `C2-invitations-skipped`, `C3-invitation-resend-info` (`<scratchpad>/loop4b/shots/`). Skrypt: `<scratchpad>/loop4b/e2e-c.mjs`.

## Poprawki po przeglądzie jakości (2026-10-30)

| SHA | Temat |
|---|---|
| `31963c2` | fix(subiekt): zero-pad numeric remarks markers (#A-1 → A-001) |
| `1e7e262` | fix(subiekt): retry code-assigning transactions once on MySQL conflicts |
| `3b674c6` | fix(cashback): cap expiry at 120 months, clamp month end, warn once |
| `b45b409` | fix(mail): tolerate a missing address in the internal-mode gate; update comment |
| `1a8e091` | fix(auth): Google refusal in internal mode lands on our sign-in page |
| `04c3d1a` | refactor(auth): one shared constant for the login rate-limit message |
| `1e06b37` | fix(auth): explicit callbackUrl for credentials sign-in |

1. **Znacznik w uwagach:** sufiks czysto liczbowy przez `formatSubiektCode` (`#A-1`, `#A-01`, `#A-0001` → `A-001`, `#a42` → `A-042`, `#A-1200` → `A-1200`; `#A-12X` bez zmian). `formatSubiektCode` w czystym `src/lib/subiekt/codeFormat.ts` (mapping.ts nie ciągnie bazy); `codes.ts` go re-eksportuje. `normalizeSubiektCode` zostaje w `actions/architects.ts` — duplikatu nie było, a plik `'use server'` nie może eksportować funkcji synchronicznej. `subiektMapping.test.ts` ładuje teraz `mapping.ts` przez hook rozwiązywania (stąd 18 zamiast 19 TS5097).
2. **Współbieżność kodów:** `withSubiektCodeRetry(work)` = `withTransaction` z jedną powtórką przy 1213 (deadlock) lub 1062 / `SQLITE_CONSTRAINT_UNIQUE` na `subiekt_code` (duplikat e-maila nie jest powtarzany); utrzymujący się konflikt → „Nie udało się nadać kodu architekta — w tej samej chwili zapisano inne konto. Spróbuj ponownie.” (tak samo dla utrzymującego się deadlocku). Wewnątrz cudzej transakcji bez powtórki. Używają go import CSV, `registerArchitect`, `accept-invitation` (cała transakcja zaproszenia, stan wyniku zerowany na początku próby) i `assignMissingSubiektCodesOp`. `nextSubiektCode` rzuca poza transakcją (`inTransaction()` w `db.ts`). Komentarz w nagłówku `codes.ts` opisuje teraz faktyczne zachowanie MySQL (blokady luki nie serializują).
3. **Cashback:** `CASHBACK_EXPIRY_MONTHS` 1–120 (121 → 12 z ostrzeżeniem); koniec miesiąca przycinany (31.08.2026 + 6 → 28.02.2027, 31.08.2027 + 6 → 29.02.2028, 29.02.2028 + 12 → 28.02.2029); ostrzeżenie raz na proces dla danej wartości (zmienna stała w procesie, funkcja wołana per pozycja).
4. **sendEmail:** `(to ?? '').trim()` — brak adresu w trybie wewnętrznym = pominięcie, nie wyjątek; komentarz o wywołujących poprawiony.
5. **Google:** `internalModeSignInRefusal(role)` (czysta, testowana na rolach ADMIN/STAFF/ARCHI/null/'' z i bez zmiennej) → `/auth/signin?error=InternalMode`; strona logowania mapuje kod przez `signInErrorMessage` (`useSyncExternalStore`, bez rozjazdu hydratacji). **Znalezione w przeglądarce (faza D, pierwszy przebieg):** po wejściu na `?error=InternalMode` poprawne logowanie admina dawało „Błędny email lub hasło”, bo next-auth bez `callbackUrl` bierze bieżący adres i czyta `res.error` z jego parametru `error` → `1e06b37` dodaje `callbackUrl: '/dashboard'` (test źródłowy był czerwony przed poprawką).
6. **Stała** `LOGIN_RATE_LIMIT_MESSAGE` w `src/lib/authMessages.ts` (authorize + strona logowania).
7. Plan: licznik testów poprawiony, Loop 7 — „Nadaj brakujące kody” po wdrożeniu i uwaga o imporcie CSV w trybie wewnętrznym.

### E2E faza D (strona logowania po przekierowaniu z odmowy Google; `next start`, `PORTAL_INTERNAL_MODE=1`)

Pierwszy przebieg: `D1 PASS`, `D2 FAIL` (skrypt liczył `#__next-route-announcer__` jako alert), `D3` timeout — prawdziwy błąd opisany w pkt 5. Po poprawce `1e06b37`, przebudowie i poprawce selektora:

```
PASS D1 ?error=InternalMode → komunikat o przygotowaniu
PASS D2 nieznany kod → brak komunikatu
PASS D3 admin loguje się z tej strony (komunikat z adresu nie blokuje) — http://localhost:3601/dashboard/admin
PASS D4 brak błędów konsoli / hydratacji
RESULT phase D: 4/4 passed
```

### Bramka po poprawkach jakości

```
$ npm test
ℹ tests 353
ℹ pass 353
ℹ fail 0
(339 → 353: subiektMapping +1, subiektCodes +7, cashbackExpiry +3, internalMode +3)

$ npx tsc --noEmit | grep -oE "error TS[0-9]+" | sort | uniq -c
  18 error TS5097

$ npm run build      (po ostatniej zmianie kodu, 1e06b37)
✓ Compiled successfully in 2.4s
  Finished TypeScript in 2.0s ...
✓ Generating static pages using 14 workers (23/23) in 173ms
(exit 0)
```
