# Raport Loop 0

## Zakres

- Dodano `npm run dev:init` uruchamiający `scripts/init-dev-db.mjs`.
- Skrypt inicjuje lokalną bazę SQLite z pełnym schematem dev i kolumnami wymaganymi przez migracje 016/017.
- Seeduje admina `admin@e2e.walldecor.test` z hasłem z `DEV_ADMIN_PASSWORD` albo domyślnie `Admin12345`.
- Seeduje 7 aktywnych szablonów email, w tym `ARCHITECT_REGISTERED`.
- Dodano walidator `scripts/validate-loop0.mjs` oraz smoke test HTTP `scripts/verify-loop0-http.mjs`.
- Uzupełniono `.env.example` o minimalne wartości do lokalnego uruchomienia.

## DOWÓD

### RED

Przed implementacją test `tests/devInitLoop0.test.ts` nie przechodził:

```text
✖ dev:init creates an idempotent SQLite database with admin and email templates
ERR_ASSERTION: npm ERR! Missing script: "dev:init"
```

### Test jednostkowy Loop 0

```text
$ node --experimental-strip-types --test tests/devInitLoop0.test.ts
✔ dev:init creates an idempotent SQLite database with admin and email templates (475.844916ms)
✔ Loop 0 validator guards against hard-coded dev password copies (0.146625ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

### Walidator Loop 0

```text
$ node scripts/validate-loop0.mjs
[dev:init] SQLite database ready: /var/folders/.../walldecor.sqlite
[dev:init] Admin login: admin@e2e.walldecor.test
[validate-loop0] OK: schema, seed admin, email templates and idempotency verified.
```

### Uruchomienie lokalne i logowanie

Serwer dev uruchomiony na tymczasowej bazie SQLite:

```text
$ npm run dev -- --hostname 127.0.0.1 --port 3107
▲ Next.js 16.2.6 (Turbopack)
- Local: http://127.0.0.1:3107
✓ Ready in 224ms
```

Smoke test HTTP:

```text
$ LOOP0_BASE_URL=http://127.0.0.1:3107 DEV_ADMIN_PASSWORD=Admin12345 node scripts/verify-loop0-http.mjs
[loop0-http] /auth/signin 200
[loop0-http] credentials login 200
[loop0-http] admin dashboard OK
```

Log serwera:

```text
GET /auth/signin 200
GET /api/auth/csrf 200
POST /api/auth/callback/credentials 200
GET /dashboard/admin 200
```

### Bramka Loop 0

```text
$ node --experimental-strip-types --test tests/*.test.ts
ℹ tests 54
ℹ pass 54
ℹ fail 0
```

```text
$ ./node_modules/.bin/tsc --noEmit
# exit 0
```

```text
$ npm run build
✓ Compiled successfully in 1970ms
✓ Generating static pages using 14 workers (26/26) in 115ms
```

## Uwagi

- Next.js pokazuje ostrzeżenie o deprecjacji pliku `middleware`; nie blokuje to Loop 0.
- `node --test` jest uruchamiany z `--experimental-strip-types`, bo repo ma testy `.ts` wykonywane bez osobnego transpilera.
