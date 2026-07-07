# Raport Loop 2

## Zakres

- Dodano Playwright (`@playwright/test`) i `playwright.config.ts`.
- Dodano pełny spec `tests/e2e/full-journey.spec.ts` dla ścieżki admin + architekt.
- Dodano `scripts/cleanup-e2e-data.mjs`, który usuwa dane testowe `[E2E]` i faktury z dysku.
- Dodano `scripts/validate-loop2.mjs`, który sprawdza raport Playwright i kluczowe asercje.
- Dodano `data-testid` do realnych elementów UI używanych przez E2E: logowanie, rejestracja, projekt, zmiana hasła, kwota pozycji, wypłata.

## DOWÓD

### Pierwsze naprawy E2E

Pierwsze biegi wykryły realne problemy stabilności testu:

```text
EPERM 127.0.0.1:3110
```

Playwright musi być uruchamiany poza sandboxem, bo startuje lokalny serwer.

```text
Expected /dashboard, received /auth/change-password
```

Poprawiono oczekiwanie testu: po submit czeka na realną zmianę `must_change_password = 0`, potem wchodzi na dashboard.

```text
getByText('[E2E] Apartament Testowy') resolved hidden
```

Poprawiono selektor na realny klikany card `role=button`.

### Playwright

Pierwszy pełny bieg:

```text
$ npx playwright test
✓ 1 [chromium] › tests/e2e/full-journey.spec.ts › Loop 2 full admin and architect journey with cleanup (5.9s)
1 passed (7.5s)
```

Drugi bieg bezpośrednio po pierwszym:

```text
$ npx playwright test
✓ 1 [chromium] › tests/e2e/full-journey.spec.ts › Loop 2 full admin and architect journey with cleanup (6.0s)
1 passed (7.5s)
```

### Walidator i cleanup

```text
$ node scripts/validate-loop2.mjs
[validate-loop2] OK: 1 Playwright test(s) reported as expected and spec assertions verified.
```

```text
$ node scripts/cleanup-e2e-data.mjs
[cleanup-e2e] removed records:
  users: 0
  projects: 0
  project_items: 0
  project_files: 0
  commissions: 0
  wallet_transactions: 0
  payout_requests: 0
  password_reset_tokens: 0
  activity_logs: 0
  invoice_files: 0
  remaining_marker_rows: 0
```

### Bramka Loop 2

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
✓ Compiled successfully in 2.2s
✓ Generating static pages using 14 workers (26/26) in 112ms
```

```text
$ npx playwright test
1 passed
```

## Artefakty

- `test-results/loop2-screenshots/c-password-change.png`
- `test-results/loop2-screenshots/f-architect-financials.png`
- `test-results/loop2-screenshots/h-paid-payout.png`
- `test-results/loop2-screenshots/invoice-e2e.pdf`

## Uwagi

- Playwright pokazuje ostrzeżenia o proporcji logo `/walldecor-logo.jpg`; nie blokuje to funkcji, ale warto poprawić w P2/P3.
- `test-results/` i `playwright-report/` są ignorowane przez git.
