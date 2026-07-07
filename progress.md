# Progress go-live

- 2026-07-07: Loop 0 zakończony lokalnie na branchu `claude/dazzling-jemison-df45b7`.
- Dodano `npm run dev:init` dla świeżej bazy SQLite z pełnym schematem dev.
- Seed admina dev: `admin@e2e.walldecor.test`, hasło z `DEV_ADMIN_PASSWORD`, domyślnie `Admin12345`.
- Seed 7 aktywnych szablonów email, w tym `ARCHITECT_REGISTERED`.
- 2026-07-07: Loop 1 zakończony lokalnie; realne prowizje z `commissions`, backfill stawek, brakujący `PENDING` i redirect zmiany hasła są potwierdzone testami.
- 2026-07-07: Loop 2 zakończony lokalnie; pełny Playwright E2E przeszedł dwa razy, cleanup `[E2E]` jest idempotentny.
- 2026-07-07: Loop 3 zakończony lokalnie na świeżej bazie E2E.
- Bramka finalna: 62 testy Node, `tsc --noEmit`, `npm run build`, `npx playwright test` = zielone.
- Staff E2E: utworzenie w ustawieniach, wymuszona zmiana hasła, read-only kolejka wypłat potwierdzone.
- Raport końcowy zapisany w `RAPORT_GOLIVE.md`; rekomendacja `GO` po backupie MySQL i review człowieka.
