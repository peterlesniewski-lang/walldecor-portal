# Raport GoLive

Data: 2026-07-07  
Branch: `claude/dazzling-jemison-df45b7`  
Commit bazowy: `f3750cb`  
Status: rekomendacja `GO` po review czlowieka i backupie produkcyjnej bazy.

## Zakres

- Loop 0: lokalny start dev na SQLite, admin testowy, szablony email, smoke logowania.
- Loop 1: prowizje z tabeli `commissions`, backfill historycznych stawek, brakujacy `PENDING`, bezpieczny redirect zmiany hasla.
- Loop 2: pelna sciezka admin + architekt w Playwright, cleanup danych testowych.
- Loop 3: finalna bramka na swiezej bazie, ekrany manualne, staff read-only, filtry partnerow.

## Decyzja

Rekomenduje wdrozenie po:

- backupie MySQL na VPS,
- merge/redeploy przez Coolify,
- sprawdzeniu logowania admina, rejestracji architekta, maila powitalnego, finalizacji projektu i kolejki wyplat na produkcji.

Nie wykonywalem deploya produkcyjnego w tym loopie.

## Znane ograniczenia

- Google OAuth zostaje poza tym pakietem; nie jest blokada GoLive.
- Tryb importu historycznego nie jest czescia tej poprawki UX/P2.
- Stany `LIMITED` / `EXCLUDED` nie sa finalnym systemem uprawnien staff; obecnie staff ma tryb weryfikacji i read-only dla finalnych platnosci.
- Legacy kolumny `users.commission_rate` i `project_items.commission_rate` moga zostac w bazie przejsciowo, ale wyswietlanie i logika finansowa uzywaja danych z `commissions`.
- Produkcyjny MySQL nie byl testowany bezposrednio w tym loopie; skrypt startowy zawiera dopelnienie schematu i backfill, ale wymagany jest backup przed wdrozeniem.
- Next.js pokazuje ostrzezenie o deprecacji `middleware` na rzecz `proxy`; nie blokuje builda.
- Przegladarka pokazuje ostrzezenie proporcji `/walldecor-logo.jpg`; nie blokuje scenariuszy, ale warto poprawic CSS logo w kolejnym kroku.

## DOWOD

### Swieza baza

Wykonano usuniecie lokalnej bazy E2E i inicjalizacje dev:

```text
DB_TYPE=sqlite DB_PATH=./e2e.sqlite DEV_ADMIN_PASSWORD=Admin12345 npm run dev:init
[dev:init] SQLite database ready: .../e2e.sqlite
[dev:init] Admin login: admin@e2e.walldecor.test
```

### Testy jednostkowe / kontraktowe

```text
node --experimental-strip-types --test tests/*.test.ts
tests 62
pass 62
fail 0
cancelled 0
skipped 0
todo 0
```

### TypeScript

```text
./node_modules/.bin/tsc --noEmit
exit code 0
```

### Build produkcyjny

```text
npm run build
next build
Compiled successfully
Running TypeScript ...
Generating static pages (26/26)
exit code 0
```

### Playwright E2E

```text
npx playwright test
Running 2 tests using 1 worker
✓ tests/e2e/full-journey.spec.ts
✓ tests/e2e/manual-screens.spec.ts
2 passed
```

Scenariusze potwierdzone:

- architekt rejestrowany przez admina,
- wymuszona zmiana hasla po pierwszym logowaniu,
- dodanie projektu, akceptacja, wycena, finalizacja,
- prowizja i cashback widoczne u architekta,
- wniosek o wyplate: `PENDING -> IN_PAYMENT -> PAID`,
- staff utworzony w ustawieniach, po pierwszym logowaniu musi zmienic haslo,
- staff widzi kolejke wyplat read-only z komunikatem o uprawnieniach,
- `/regulamin`, `/dashboard/help`, `/dashboard/admin/settings`, `/dashboard/admin/architects` odwiedzone w E2E,
- filtry `Partner`, `Partner Plus`, `Partner Premium` na liscie architektow dzialaja,
- dashboard admina i wykresy renderuja sie bez bledow konsoli typu `error`.

### Cleanup E2E

```text
node scripts/cleanup-e2e-data.mjs --json
{"users":0,"projects":0,"project_items":0,"project_files":0,"commissions":0,"wallet_transactions":0,"payout_requests":0,"password_reset_tokens":0,"activity_logs":0,"invoice_files":0,"remaining_marker_rows":0}
```
