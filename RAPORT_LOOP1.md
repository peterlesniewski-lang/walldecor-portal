# Raport Loop 1

## Zakres

- Widok szczegółów projektu architekta korzysta z `project.commissions`, nie z legacy pola pozycji.
- Dodano `src/lib/projectCommissions.ts` do sumowania kwot i stawek per pozycja oraz per projekt.
- `updateProjectItem` tworzy brakującą prowizję `PENDING` dla pozycji `PRODUCT` w projektach `PRZYJĘTY` / `W_REALIZACJI`.
- `ensure-production-schema.mjs` i `dev:init` backfillują historyczne `commissions.rate` z relacji `commission amount / item amount`.
- `/auth/change-password` jest server componentem i bez sesji przekierowuje na `/auth/signin`.

## DOWÓD

### RED

Przed implementacją punktowe testy Loop 1 padały:

```text
✖ /auth/change-password is a server page that redirects unauthenticated users
✖ production schema startup backfills historical commission rates without changing amounts
✖ dev init includes the same historical commission rate backfill for SQLite
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../src/lib/projectCommissions.ts
```

### Testy punktowe Loop 1

```text
$ node --experimental-strip-types --test tests/commissionDisplay.test.ts tests/changePasswordRedirect.test.ts tests/commissionBackfill.test.ts tests/projectItemPendingCommission.test.ts
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### Walidator Loop 1

```text
$ node scripts/validate-loop1.mjs
[validate-loop1] OK: historical rate backfill and missing PENDING commission invariant verified.
```

### HTTP redirect

```text
$ LOOP1_BASE_URL=http://127.0.0.1:3108 node scripts/verify-loop1-http.mjs
[loop1-http] /auth/change-password 307 -> /auth/signin
```

### Bramka Loop 1

```text
$ node --experimental-strip-types --test tests/*.test.ts
ℹ tests 62
ℹ pass 62
ℹ fail 0
```

```text
$ ./node_modules/.bin/tsc --noEmit
# exit 0
```

```text
$ npm run build
✓ Compiled successfully in 2.0s
✓ Generating static pages using 14 workers (26/26) in 110ms
```

## Uwagi

- Kwoty historycznych prowizji nie są zmieniane przez backfill; uzupełniana jest tylko efektywna stawka `rate`.
- `npx playwright test` zaczyna obowiązywać od Loop 2, zgodnie z planem.
