# Plan naprawczy go-live — walldecor-portal (loop dla Codex / Claude Code)

Data: 2026-07-07 · Baza: `main` @ `c838eec` · Cel: aplikacja gotowa do produkcji
(https://archi.walldecor.pl), zweryfikowana pełnym przejściem ścieżki użytkownika.

## Kontekst projektu (przeczytaj przed startem)

- Next.js 16 App Router + TypeScript, NextAuth (JWT), Tailwind. **Bez ORM** — raw SQL
  przez `query()` / `withTransaction()` z `src/lib/db.ts` (SQLite dev / MySQL prod,
  dialekty tłumaczy `preprocessSQL`).
- Role: `ARCHI` / `STAFF` / `ADMIN` (uprawnienia: `src/lib/rbac.ts`).
- Program partnerski: `src/lib/partnerProgram.ts` — Partner 10% (0–30k), Partner Plus 12%
  (30–50k), Partner Premium 15% (50k+). Stawka naliczonej prowizji jest zapisana w
  `commissions.rate`. **To jedyne źródło stawek — zakaz zaszywania procentów gdziekolwiek.**
- Pipeline projektu: ZGŁOSZONY → PRZYJĘTY → W_REALIZACJI → ZAKOŃCZONY (lub NIEZREALIZOWANY).
  Prowizje PENDING powstają przy PRZYJĘTY/W_REALIZACJI, EARNED przy ZAKOŃCZONY.
- Testy: `node --test 'tests/*.test.ts'` (52 obecnie zielone). Schemat MySQL:
  `deploy/schema.mysql.sql` + migracje `migrations/*.sql` + `scripts/ensure-production-schema.mjs`.
- Dev e-mail: gdy `EMAIL_HOST` nieustawiony i `NODE_ENV=development`, `sendEmail` loguje
  treść do konsoli zamiast wysyłać.

## Zasady globalne (obowiązują w KAŻDYM loopie — kopiuj do kontekstu)

1. Żaden widoczny element interaktywny nie jest atrapą: działa albo nie istnieje.
   Nie renderuj UI "na przyszłość".
2. Zakaz placeholderów: pliki = bajty na dysku; PDF = prawdziwy plik; dane na ekranie =
   z bazy; akcja "zapisz/zatwierdź" = zmiana stanu w bazie (nie tylko toast).
3. Logika domenowa w `src/lib/` / server actions — nie w komponentach UI.
4. Wszystkie kwoty/stawki prowizji wyłącznie z tabeli `commissions` (amount_net, rate)
   albo z `partnerProgram.ts` — nigdy z legacy kolumn `users.commission_rate`,
   `project_items.commission_rate` (martwe kolumny, patrz Loop 1).
5. Po instalacji jakiegokolwiek pakietu commituj `package.json` + `package-lock.json`
   razem z kodem (Docker build robi świeże `npm ci`).
6. Świadome uproszczenia zgłaszaj w raporcie, nie ukrywaj.
7. Limit 5 iteracji naprawczych na loop; po przekroczeniu STOP i raport problemu —
   nie oznaczaj loopa jako done.

## Bramka każdego loopa (wszystko zielone albo loop NIE jest skończony)

```bash
node --test 'tests/*.test.ts' \
  && ./node_modules/.bin/tsc --noEmit \
  && npm run build \
  && npx playwright test   # od Loopa 2
```

---

# Loop 0 — Deweloper stawia świeże środowisko jedną komendą

## Cel

Osoba (lub agent e2e) na czystym checkoutcie uruchamia `npm run dev:init && npm run dev`
i po 2 minutach loguje się jako admin na działającym portalu z pustą bazą.

## Zakres

1. Skrypt `scripts/init-dev-db.mjs`: tworzy plik SQLite (ścieżka z `DB_PATH`,
   domyślnie `./walldecor.sqlite`) z pełnym schematem — przetłumacz
   `deploy/schema.mysql.sql` na SQLite (AUTO_INCREMENT→AUTOINCREMENT, ENUM→TEXT,
   DATETIME defaults) **plus** kolumny z migracji 016 (`commissions.rate`,
   `users.must_change_password`, `users.password_changed_at`) oraz INSERTY szablonów
   e-mail (slugi: ARCHITECT_REGISTERED — treść z migracji 017, PROJECT_ADDED_USER,
   PROJECT_ADDED_ADMIN, PROJECT_ACCEPTED, PAYOUT_PROCESSED, PASSWORD_RESET,
   PROFILE_INCOMPLETE — treści z migracji 008–010/014/017).
2. Skrypt seeduje konto ADMIN: `admin@e2e.walldecor.test` / hasło z env
   `DEV_ADMIN_PASSWORD` (default `Admin12345`), `must_change_password = 0`.
3. `package.json`: skrypt `"dev:init": "node scripts/init-dev-db.mjs"`; skrypt jest
   idempotentny (drugie uruchomienie nie duplikuje danych i nie wywala się).
4. `.env.example` uzupełnione o `DB_TYPE=sqlite`, `DB_PATH`, `DEV_ADMIN_PASSWORD`.

Świadomie POZA zakresem: docker-compose, MySQL lokalnie, dane demo.

## Definition of Done

- [ ] Na czystym klonie: `npm ci && npm run dev:init && DB_TYPE=sqlite npm run dev`
      startuje bez błędów; `/auth/signin` renderuje się (HTTP 200).
- [ ] Logowanie adminem z seedu przechodzi i ląduje na `/dashboard/admin` z zerowymi
      KPI (nie błędem SQL).
- [ ] `sqlite3 walldecor.sqlite ".schema commissions"` zawiera kolumnę `rate`;
      `.schema users` zawiera `must_change_password`.
- [ ] Ponowne `npm run dev:init` kończy się sukcesem i nie duplikuje admina ani szablonów
      (SELECT count się nie zmienia).

## Self-testing

- Walidator `scripts/validate-loop0.mjs`: usuwa testowy plik bazy, odpala init,
  otwiera bazę better-sqlite3 i sprawdza: 11 tabel istnieje, admin istnieje z hashem
  bcrypt (nie plaintext), 7 szablonów e-mail aktywnych. Grep-zakaz: brak plaintext
  hasła w skrypcie poza env defaultem.
- Bramka jak wyżej (bez playwright).

## Audyt atrap + Raport

- Checklist: zaloguj się ręcznie (przeglądarką lub curl na NextAuth), pokaż output.
- Raport z sekcją DOWÓD: output komend bramki + zrzut/response strony logowania.

---

# Loop 1 — Architekt widzi prawdziwe prowizje; admin wycenia projekt bez dziur

## Cel

Architekt na stronie szczegółów projektu widzi dokładnie te kwoty i stawki prowizji,
które system naliczył w bazie; wycena projektu przez admina zawsze tworzy/aktualizuje
prowizję PENDING.

## Zakres — 4 błędy znalezione w audycie 2026-07-07

### 1.1 [KRYTYCZNY] Strona projektu architekta liczy prowizję z martwej kolumny

`src/components/ProjectDetailClient.tsx` linie ~104–105 i ~175–178 używają
`item.commission_rate` — kolumny legacy (na MySQL `DEFAULT 0.15`, na SQLite brak →
`NaN%`). Architekt widzi "Prowizja 15%" niezależnie od statusu partnerskiego.

Naprawa: komponent dostaje prowizje z `project.commissions` (już zwracane przez
`getProjectDetails`). Per pozycja: suma `amount_net` prowizji o statusach
EARNED/IN_PAYMENT/PAID/PENDING dopasowanych po `project_item_id`; stawka z
`commissions.rate` (wyświetlaj tylko gdy nie NULL). Gdy pozycja nie ma prowizji:
tekst "prowizja po rozliczeniu" — żadnych domyślnych 15%.

### 1.2 [ŚREDNI] Wycena pozycji nie tworzy brakującej prowizji PENDING

`updateProjectItem` w `src/app/actions/projects.ts` (branch PRZYJĘTY/W_REALIZACJI)
robi tylko `UPDATE commissions ... WHERE status='PENDING'`. Projekt zgłoszony bez kwot
(pozycje 0 zł), zaakceptowany, potem wyceniony — UPDATE trafia w 0 wierszy i prowizja
"w toku" nie istnieje aż do zakończenia.

Naprawa: gdy UPDATE nie objął żadnego wiersza, a `amount_net > 0` i pozycja jest
typu PRODUCT — INSERT prowizji PENDING ze stawką `getArchitectCommissionRate(ownerId)`.

### 1.3 [ŚREDNI] Stare prowizje bez zapisanej stawki przeliczają się nową stawką

Prowizje sprzed migracji 016 mają `rate = NULL`. `getProjectCommissionRate` przy
braku stawki bierze bieżącą stawkę architekta (10–15%), więc edycja pozycji starego
projektu (naliczonego po 7%) wygeneruje korektę wg nowej stawki.

Naprawa: backfill w `scripts/ensure-production-schema.mjs` **i** w `init-dev-db` bez
zmiany kwot: `UPDATE commissions c JOIN project_items i ... SET c.rate =
ROUND(c.amount_net / i.amount_net, 4) WHERE c.rate IS NULL AND i.amount_net > 0
AND c.status IN ('EARNED','IN_PAYMENT','PAID')`. (SQLite: UPDATE FROM.) Kwoty
prowizji NIE zmieniają się — zapisujemy tylko efektywną stawkę historyczną.

### 1.4 [DROBNY] /auth/change-password bez sesji pokazuje surowy błąd

Wejście bez zalogowania + submit → "Unauthorized". Naprawa: strona sprawdza sesję
(server-side) i przekierowuje na `/auth/signin`.

Świadomie POZA zakresem: usuwanie legacy kolumn `commission_rate` ze schematu
(osobna migracja po go-live), tryby LIMITED/EXCLUDED z briefu, okres przejściowy.

## Definition of Done

- [ ] Architekt z naliczoną prowizją 10% otwiera projekt: przy każdej pozycji widzi
      kwotę równą (co do grosza) sumie `commissions.amount_net` tej pozycji z bazy
      oraz "10%" — nigdzie na stronie nie występuje 15% ani NaN.
- [ ] Pozycja bez prowizji (projekt ZGŁOSZONY) pokazuje "prowizja po rozliczeniu",
      a suma prowizji projektu = 0.
- [ ] Admin akceptuje projekt z pozycją 0 zł, potem ustawia jej wartość 10 000 zł:
      w bazie istnieje prowizja PENDING 1 000 zł (rate 0.10), a KPI "Prowizje w toku"
      na dashboardzie admina rośnie o 1 000 zł.
- [ ] Po backfillu: stara prowizja (ręcznie wstawiona w teście z rate=NULL, kwota 7%
      pozycji) dostaje rate 0.07; edycja kwoty pozycji generuje korektę po 0.07,
      nie po 0.10.
- [ ] Niezalogowany wchodzi na `/auth/change-password` → ląduje na `/auth/signin`.

## Self-testing

- Testy jednostkowe: `tests/commissionDisplay.test.ts` (mapowanie commissions→pozycje),
  rozszerzenie `tests/partnerProgram.test.ts` o fallback stawki; test source-level
  zakazu antywzorca: `ProjectDetailClient.tsx` NIE zawiera `commission_rate`.
- Walidator `scripts/validate-loop1.mjs`: na świeżej bazie z Loop 0 wykonuje przez
  bezpośrednie wywołania SQL scenariusz 1.2 (projekt → akceptacja → wycena) i sprawdza
  rekord PENDING w bazie (kwota, rate, status).
- Bramka pełna (bez playwright, jeśli Loop 2 jeszcze nie istnieje).

## Audyt atrap + Raport

- Klik-test strony projektu architekta (każdy element), test uprawnień (drugi architekt
  nie widzi cudzego projektu — route sprawdza ownera), sekcja DOWÓD z outputami.

---

# Loop 2 — Pełna ścieżka klienta klikana przez UI na dummy danych (self-testing loop)

## Cel

Automat (Playwright) przechodzi cały cykl życia współpracy — od utworzenia architekta
przez admina po opłaconą wypłatę prowizji — wyłącznie klikając UI, na danych oznaczonych
prefiksem `[E2E]`, i na końcu usuwa po sobie wszystkie dane.

## Zakres

1. `npm i -D @playwright/test` (+ `npx playwright install chromium`); config
   `playwright.config.ts`: `webServer` odpala `npm run dev` z `DB_TYPE=sqlite
   DB_PATH=./e2e.sqlite` po uprzednim `dev:init` na tym pliku; baseURL localhost:3000.
2. Scenariusz `tests/e2e/full-journey.spec.ts` — jeden spec, kroki sekwencyjne:
   a. **Admin loguje się** (konto z seedu).
   b. **Tworzy architekta** `[E2E] Jan Testowy`, e-mail `jan@e2e.walldecor.test` —
      przechwytuje wygenerowane hasło tymczasowe z UI (modal pokazuje `generatedPassword`).
   c. **Architekt loguje się** hasłem tymczasowym → zostaje przymusowo przekierowany
      na `/auth/change-password`; próba ręcznego wejścia na `/dashboard` też przekierowuje.
      Zmienia hasło na `E2eTest123` → ląduje w panelu; widzi status "Partner" i "10%".
   d. **Zgłasza projekt** `[E2E] Apartament Testowy` bez kwoty (pole budżetu puste) —
      projekt widnieje na jego liście ze statusem ZGŁOSZONY.
   e. **Admin otwiera projekt**, ustawia wartość pozycji 12 000 zł, akceptuje
      (→ PRZYJĘTY), przechodzi W_REALIZACJI → ZAKOŃCZONY.
   f. **Architekt widzi**: prowizję 1 200 zł (10%) jako dostępną, cashback 240 zł
      w portfelu, obrót 12 000 zł i progress do Partner Plus (brakuje 18 000 zł).
   g. **Architekt składa wniosek o wypłatę** 1 200 zł załączając wygenerowany w teście
      prawdziwy PDF (min. poprawny nagłówek `%PDF-1.4`, > 0 bajtów).
   h. **Admin widzi wniosek**, pobiera fakturę (response 200, `application/pdf`,
      rozmiar > 0), akceptuje i oznacza PAID.
   i. **Architekt widzi status wypłaty PAID** w historii portfela.
   j. **Sprzątanie**: patrz pkt 3 — spec na końcu wywołuje cleanup i weryfikuje.
3. Skrypt `scripts/cleanup-e2e-data.mjs`: usuwa z bazy WSZYSTKIE rekordy powiązane
   z użytkownikami o e-mailu `%@e2e.walldecor.test` (poza seedowym adminem) w kolejności
   FK: commissions → wallet_transactions → payout_requests → project_files →
   project_items → projects → password_reset_tokens → activity_logs (user_id dummy) →
   users; usuwa też wgrane pliki faktur tych wypłat z `private_uploads/`. Wypisuje
   ile rekordów usunął per tabela. Po uruchomieniu: SELECTy markera zwracają 0,
   a liczba rekordów NIE-dummy jest identyczna jak przed testem (spec zapisuje baseline
   przed startem i porównuje po cleanupie).

Świadomie POZA zakresem: testy na produkcyjnym MySQL (patrz Loop 3 — decyzja człowieka),
testy Google OAuth, import CSV, e2e resetu hasła mailem.

## Definition of Done

- [ ] `npx playwright test` na czystym checkoutcie przechodzi cały scenariusz a–j
      bez interwencji człowieka (jedna komenda, exit 0).
- [ ] Krok (c) faktycznie dowodzi wymuszenia: asercja, że przed zmianą hasła GET
      `/dashboard` NIE renderuje dashboardu (redirect), a po zmianie renderuje.
- [ ] Kwoty w (f) asertowane co do złotówki na podstawie widocznego tekstu UI,
      nie z bazy.
- [ ] Faktura z (h) pobrana przez HTTP w kontekście sesji admina: status 200,
      content-type `application/pdf`, `body.length > 0`; ta sama prośba bez sesji → 403/401.
- [ ] Po cleanupie: zapytania o marker `[E2E]` / `@e2e.walldecor.test` zwracają 0 wierszy
      we wszystkich tabelach; plik faktury nie istnieje na dysku; baseline nie-dummy
      rekordów zgodny z początkiem.
- [ ] Drugi bieg `npx playwright test` bezpośrednio po pierwszym też przechodzi
      (dowód idempotencji cleanupu).

## Self-testing

- Ten loop JEST testem; dodatkowo walidator `scripts/validate-loop2.mjs` czyta raport
  Playwright (json reporter) i sprawdza, że wykonały się wszystkie kroki a–j (żadnego
  `skipped`), oraz że spec zawiera asercje na kwoty (grep-zakaz: brak `test.skip`,
  brak `toBeVisible()` jako jedynej asercji kroku f).
- Bramka pełna z playwright.

## Audyt atrap + Raport

- Zrzuty ekranu Playwright (trace/screenshots on) dla kroków c, f, h dołączone do
  raportu. Sekcja DOWÓD: pełny output `npx playwright test` + tabela "usunięto rekordów"
  z cleanupu.

---

# Loop 3 — Finał: dzień z życia na czystej bazie + decyzja go-live

## Cel

Na całkowicie świeżej bazie (nowy plik SQLite) pełny scenariusz z Loopa 2 przechodzi
za pierwszym podejściem, a raport końcowy pozwala człowiekowi podjąć decyzję o deployu.

## Zakres

1. Usuń `e2e.sqlite`, odpal `dev:init`, wykonaj pełną bramkę + `npx playwright test`.
2. Ręczny (agentowy) klik-test ekranów NIE pokrytych spec-em: `/regulamin`,
   `/dashboard/help`, `/dashboard/admin/settings` (tworzenie STAFF + reset hasła →
   sprawdź że STAFF po zalogowaniu też musi zmienić hasło), `/dashboard/admin/architects`
   (filtry Partner/Plus/Premium filtrują listę), wykresy na dashboardzie admina
   renderują się bez błędów konsoli.
3. Raport go-live: wersja commita, output bramki, lista znanych ograniczeń
   (LIMITED/EXCLUDED, okres przejściowy, legacy kolumny), rekomendacja deploy tak/nie.

## Definition of Done

- [ ] Pełna bramka zielona na świeżej bazie za pierwszym uruchomieniem.
- [ ] Każdy ekran z pkt 2 odwiedzony; zero martwych elementów interaktywnych
      (element bez reakcji = fail loopa) i zero błędów w konsoli przeglądarki.
- [ ] STAFF utworzony w ustawieniach loguje się, przechodzi wymuszoną zmianę hasła
      i widzi kolejkę wypłat w trybie read-only z komunikatem o uprawnieniach.
- [ ] Raport go-live zapisany jako `RAPORT_GOLIVE.md` z sekcją DOWÓD.

## Uwaga o produkcji (decyzja człowieka, nie agenta)

Deploy = merge do `main` + trigger w Coolify (aplikacja `walldecor-portal`,
uuid `gkcgcwwwsc8oo0oo480c8gw0`). Migracje MySQL aplikuje automatycznie
`ensure-production-schema.mjs` przy starcie. **Agent nie deployuje i nie odpala
testów e2e na produkcyjnej bazie** — dummy dane i cleanup wyłącznie na lokalnym SQLite.

---

## Kolejność i zasada pracy loopa

Loop 0 → 1 → 2 → 3, jeden loop = jedna sesja/PR. Przed rozpoczęciem loopa przeczytaj
`progress.md` i ten plan; po ukończeniu dopisz wynik do `progress.md` (max 10 punktów).
Loop bez sekcji DOWÓD w raporcie NIE jest ukończony. Suma zielonych loopów cząstkowych
nie jest dowodem działania całości — dowodem jest wyłącznie zielony Loop 3.
