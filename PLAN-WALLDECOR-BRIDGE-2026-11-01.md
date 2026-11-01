# walldecor-bridge — mostek MCP do bazy Subiekta GT — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Przed zamknięciem każdego loopa wykonaj „Checklist audytu atrap” z końca dokumentu. Reguły pisania i odbioru: skill `plany-bez-atrap`.

**Stan wyjściowy (2026-11-01):** integracja Subiekt GT → Portal Architekta ma zmergowane loopy 0–6 (`PLAN-SUBIEKT-2026-10-29.md`); agent `agent-subiekt/` czeka na `--probe`/`--dry-run` na PC `SERWER`, Loop 7 (wdrożenie portalu) tylko na polecenie użytkownika. Ten plan to **osobny projekt**, który startuje po Loopie 7 portalu (decyzja z 2026-10-30) i reużywa fundament agenta: login SQL `portal_reader`, zweryfikowany schemat GT, moduły `db.ts`, `queries.ts`, `config.ts`, `probe.ts`.

**Cel:** właściciel pyta czat AI (Claude Code / Claude Desktop) o sprzedaż, dokumenty, kontrahentów i należności z Subiekta GT i dostaje odpowiedź z bazy w kilka sekund, bez SSMS i bez ręcznego SQL; aplikacja WallDecor-App (`app.walldecor.pl`) pokazuje w module Finanse przychody miesięczne z Subiekta obok wpisanych ręcznie i pozwala je zastosować jednym kliknięciem.

**Architektura:** serwis Node na PC `SERWER` (ten z bazą GT) łączy się z SQL Server loginem tylko do odczytu i wystawia dwie fasady nad jedną warstwą zapytań: (a) serwer MCP (Streamable HTTP) z listą nazwanych narzędzi dla czatów AI, (b) REST JSON dla WallDecor-App. Dowolny SQL z zewnątrz jest niemożliwy — każde narzędzie to sparametryzowane zapytanie z walidacją wejścia, limitem wierszy i czasu. Serwis słucha wyłącznie na `127.0.0.1`; na zewnątrz wystawia go `tailscale serve` (HTTPS z certyfikatem tailnetu, widoczny tylko dla urządzeń w tailnecie: Mac użytkownika, VPS Coolify). Każde wywołanie jest logowane (kto, jakie narzędzie, parametry, liczba wierszy, czas). Portal Architekta nie jest konsumentem w v1 (agent push zostaje).

**Stack:** Node 22 LTS na Windows 10 (jak agent), TypeScript kompilowany `tsc` do `dist/`, `mssql` 12.7.x, `@modelcontextprotocol/sdk` 1.32.x (linia v1: `McpServer` + `StreamableHTTPServerTransport`; linia v2 `@modelcontextprotocol/server` 2.4.0 istnieje — decyzja o wersji w Loopie 0 po sprawdzeniu `npm view` i dokumentacji transportu, domyślnie v1), `zod` 4.x do schematów narzędzi, serwer HTTP z `node:http` (bez frameworka), testy `node:test`, baza testowa Azure SQL Edge w Dockerze (jak w Loopie 5 planu Subiekta). Repo: nowe `walldecor-bridge` (GitHub `peterlesniewski-lang/walldecor-bridge`), zasiane kopią modułów z `agent-subiekt/src/`. Po stronie WallDecor-App: Next.js 16, Prisma 5.22 (`src/generated/prisma`), migracje SQL w `prisma/migrations/`, Vitest + Playwright.

---

## 0. Zasady globalne planu

1. **Żaden widoczny element interaktywny nie może być atrapą.** Każdy przycisk, link, karta działa albo nie istnieje. Dotyczy panelu WallDecor-App i strony statusu mostka.
2. **Zakaz placeholderów danych.** Odpowiedź narzędzia MCP i endpointu REST pochodzi z bazy GT (lub z bazy testowej SQL Edge w testach), nigdy z pliku demo ani z stałych w kodzie. „Zastosuj przychód” zapisuje wiersz `Revenue` w bazie aplikacji, nie tylko pokazuje komunikat.
3. **Zero dowolnego SQL od klienta.** Nie istnieje narzędzie ani endpoint przyjmujący tekst SQL, nazwę tabeli lub kolumny. Wszystkie zapytania leżą w `src/queries/*.ts` jako stałe ze sparametryzowanymi wejściami (`@param`). Walidator loopa: `grep -rn "sql\b\|query\b" src/tools src/http` nie znajduje parametru narzędzia przekazywanego do tekstu zapytania.
4. **Tylko odczyt, bez wyjątków.** Jedyny login to `portal_reader` (`db_datareader` + DENY INSERT/UPDATE/DELETE/EXECUTE). Pool `readOnlyIntent: true`. Test w Loopie 1 wykonuje przez pool `UPDATE` i oczekuje błędu uprawnień.
5. **Limity zawsze.** Każde zapytanie: `TOP (@limit)` z `limit ≤ 500` (domyślnie 100), `requestTimeout` 30 s, zakres dat ≤ 24 miesięcy, co najwyżej 4 równoległe zapytania na proces, 60 wywołań na minutę na token. Przekroczenie = czytelny błąd narzędzia, nie wyjątek procesu.
6. **Uwierzytelnienie każdego wywołania.** Nagłówek `Authorization: Bearer <token>`; tokeny w `.env` jako `BRIDGE_TOKENS=nazwa:scope1,scope2:sha256hex;…` (w pliku tylko hashe). Brak/zły token → 401 bez treści odpowiedzi narzędzia; token bez zakresu → 403. `GET /health` bez tokena zwraca tylko `{ ok, version, db: "up"|"down" }`.
7. **Log wywołań.** Każde wywołanie narzędzia/endpointu daje wiersz w `logs/calls-RRRR-MM-DD.jsonl`: czas, nazwa tokena, narzędzie, parametry (bez danych osobowych w treści: numery dokumentów tak, NIP tak, nazwy kontrahentów nie), liczba wierszy, czas trwania, wynik. Retencja 180 dni; pliki starsze usuwa sam proces.
8. **Bramka loopa:** `npm test && npm run typecheck && npm run build` w repo mostka (i odpowiednio `npm test && npm run typecheck:app && npm run build` w WallDecor-App dla loopów 4–5), walidator loopa wykonany z wynikiem, scenariusz ręczny z DoD przeklikany/przepytany. Limit 5 iteracji naprawczych; po przekroczeniu zatrzymać się i opisać problem, nie oznaczać loopa jako ukończony.
9. **Dowód, nie deklaracja.** Raport loopa zawiera uruchomione komendy z wynikiem, odpowiedź `curl` (REST) i zapis sesji klienta MCP (np. `claude mcp list`, transkrypt wywołania narzędzia), wiersz z bazy (`sqlite3`/`sqlcmd`), zrzut ekranu panelu. Loop bez sekcji DOWÓD nie jest ukończony.
10. **Nic nie dotyka produkcji WallDecor-App** przed Loopem 6. Nic nie dotyka bazy GT inaczej niż SELECT przez `portal_reader`. Mostek na `SERWER` instaluje wyłącznie użytkownik według README (jak agent).

---

## 1. Decyzje (potwierdzone 2026-10-30 / 2026-11-01)

| # | Decyzja | Skutek w implementacji |
|---|---------|------------------------|
| 1 | Nazwa projektu: **walldecor-bridge**. Mostek MCP do bazy Subiekta GT (potwierdzone 2026-11-01). | Nowe repo, nowy katalog `C:\PortalArchi\walldecor-bridge` na `SERWER`. |
| 2 | Pierwsi odbiorcy: **WallDecor-App (serwer)** oraz **czaty AI przez MCP**. Portal Architekta nie jest odbiorcą w v1. | Dwie fasady nad jedną warstwą zapytań: `/mcp` (Streamable HTTP) i `/api/*` (REST JSON). |
| 3 | Dostęp przez **Tailscale**, wyłącznie odczyt (2026-10-30). | `tailscale serve` na `SERWER` → `https://serwer.<tailnet>.ts.net/`; brak Funnel; port SQL nigdy nie wystawiony. Fallback (gdyby kontener Coolify nie mógł dotrzeć do tailnetu): Cloudflare Tunnel + Access service token — decyzja w Loopie 0. |
| 4 | **Lista dozwolonych narzędzi zamiast dowolnego SQL** (2026-10-30). | §2.1. Pytanie, na które nie ma narzędzia, dostaje odpowiedź „brak narzędzia, oto lista” — nie SQL. |
| 5 | Czat finansowy w WallDecor-App (Codex CLI w workerze) ma **wyłączone MCP** polityką (`orchestrator.mcp.enabled=false` w `src/lib/ai/codex-policy.ts`). | WallDecor-App konsumuje mostek **po stronie serwera przez REST** i dokłada wynik do `finance-context.ts`; worker Codex nie dostaje dostępu sieciowego do mostka. |
| 6 | Przychód w WallDecor-App = kwota **brutto** za miesiąc, per centrum kosztów (`JAG`, `PUL`) i kanał (`SALON` = towar, `MONTAZ` = usługa, `ECOMMERCE`), zgodnie z `src/lib/validations/revenue.ts`. | Narzędzie `sales_summary` zwraca netto i brutto w podziale miesiąc × magazyn × rodzaj pozycji (towar/usługa). |
| 6a | **Magazyny GT → centra (2026-11-01):** seria `MAG` = Jagiellońska (`JAG`), seria `PUŁ` = Puławska (`PUL`). | `SUBIEKT_BRIDGE_WAREHOUSE_MAP=PUŁ:PUL,MAG:JAG`; symbol magazynu z `sl_Magazyn.mag_Symbol` (sonda potwierdza, że symbole odpowiadają seriom numeracji). Dokument z magazynu poza mapą → osobny wiersz „nieprzypisany magazyn” w snapshocie i ostrzeżenie w UI, nigdy ciche pominięcie. |
| 6b | **E-commerce (2026-11-01):** na razie nie odróżniamy, sprzedaż internetowa jest zgrupowana z Puławską; w przyszłości osobny magazyn `INT`. | Z Subiekta zasilane są tylko kanały `SALON` i `MONTAZ`; kanał `ECOMMERCE` zostaje ręczny (kolumna „Subiekt” pokazuje „—”, bez przycisku). Mapa dopuszcza wpis z kanałem: `INT:PUL:ECOMMERCE` — gdy magazyn `INT` powstanie, wystarczy zmiana `.env`, bez zmiany kodu (test jednostkowy na ten przypadek już w Loopie 4). |
| 7 | Dokumenty sprzedaży do przychodu: FS (2) + KFS (6) + PA (21, paragony). Faktury wystawione do paragonu nie mogą liczyć się podwójnie. **Kierunek (2026-11-01):** jak w raportach GT, gdzie wyklucza się faktury detaliczne; ale najpierw sprawdzić zapytaniem SQL, czy FS z wydrukowanym paragonem są dodatkowo oznaczone w bazie. | §6 pkt 3: zestaw zapytań dla użytkownika do SSMS (przed Loopem 1) + sonda Loopa 1 (kolumny `%fisk%`, podtypy FS, powiązania FS→PA). Filtr w `queries/sales.ts` po wyniku. |
| 7a | **Kontrola fiskalizacji (2026-11-01, przyszły zakres):** firma musi kontrolować, czy faktura dla osoby prywatnej została zafiskalizowana. **Kryterium dodatkowe (2026-11-01):** faktura wysłana do KSeF jest fakturą B2B i nie powinna mieć paragonu, więc wypada z listy kontroli. | Narzędzie `unfiscalized_invoices` w Loopie 3 (warunkowo po sondzie): FS w okresie, nabywca bez NIP (`adrh_NIP` puste), bez znacznika fiskalizacji, bez paragonu w łańcuchu **i bez statusu „wysłana do KSeF”** (kolumny KSeF w GT do potwierdzenia sondą, §6 pkt 3 zapytanie A). Dodatkowo osobna lista anomalii `ksef_with_receipt`: FS wysłane do KSeF, które mimo to mają paragon w łańcuchu. Zastrzeżenie: jeśli firma wysyła do KSeF także faktury konsumenckie (dobrowolnie), kryterium KSeF ukryje je — do potwierdzenia z użytkownikiem na podstawie liczności z zapytania F. |
| 8 | Mostek nie liczy prowizji architektów ani nie dubluje logiki portalu. | Narzędzia zwracają surowe dane dokumentów; prowizje zostają w portalu (zob. `PLAN-SUBIEKT-2026-10-29.md` §0 pkt 3). |

Poza zakresem v1: zapis do Subiekta (Sfera), konsument w Portalu Architekta, ChatGPT (łączniki ChatGPT wymagają publicznego URL — wraca przy decyzji o Funnel/Cloudflare), stany magazynowe i personel (Loop 3 ma je jako opcję po sondzie), powiadomienia o awarii mostka poza stroną statusu.

---

## 2. Kontrakt

### 2.1 Narzędzia MCP (`/mcp`) i ich odpowiedniki REST (`/api/*`)

Każde narzędzie: schemat wejścia `zod`, opis po polsku (model czyta opis), wynik `structuredContent` (JSON) + `content[0].text` (krótkie podsumowanie po polsku, np. „12 dokumentów, suma netto 48 213,10 PLN”). Daty `YYYY-MM-DD`, kwoty jako liczby z 2 miejscami, waluta PLN. Zakres `scope` wymagany na tokenie.

| Narzędzie | Wejście | Wynik | Zapytanie (tabele GT) | Scope | REST |
|---|---|---|---|---|---|
| `sales_summary` | `from`, `to` (≤ 24 mies.), `group_by`: `month` \| `month_warehouse` \| `month_warehouse_kind`, `doc_types` (domyślnie `["FS","KFS","PA"]`) | wiersze `{ year, month, warehouse_symbol?, kind? ("TOWAR"\|"USLUGA"), documents, net_total, gross_total }` + suma | `dok__Dokument` (dok_Typ, dok_Podtyp, dok_Status, dok_DataWyst, dok_MagId, dok_WartNetto, dok_WartBrutto), `sl_Magazyn`, dla `kind`: `dok_Pozycja.ob_TowRodzaj`, `ob_WartNetto`, `ob_WartBrutto` | `sales:read` | `GET /api/sales/summary?from&to&group_by` |
| `sales_documents` | `from`, `to`, `doc_types`, `warehouse_symbol?`, `contractor_nip?`, `min_gross?`, `limit` (≤ 500) | lista `{ id, type, number, issued_at, warehouse_symbol, contractor_name, contractor_nip, net_total, gross_total, is_paid, remaining }` | jak agent: `dok__Dokument`, `adrh__Historia`/`adr__Ewid`, `nz__Finanse` (`paid.ts`) | `documents:read` | `GET /api/sales/documents` |
| `document_detail` | `id` (dok_Id) **lub** `number` (dok_NrPelny) | nagłówek + pozycje (`dok_Pozycja` jak `payload.ts`) + płatności (`nz__Finanse`) + łańcuch (`dok_DoDokId` w górę i w dół) | zapytania agenta `sqlHeadersByIds`, `sqlPositions`, `sqlFinance` | `documents:read` | `GET /api/documents/:id` |
| `top_products` | `from`, `to`, `by`: `net` \| `quantity`, `warehouse_symbol?`, `limit` (≤ 100) | `{ product_id, name, quantity, net_total, documents }` | `dok_Pozycja` ⋈ `tw__Towar` ⋈ `dok__Dokument` (tylko FS/KFS/PA) | `sales:read` | `GET /api/sales/top-products` |
| `contractor_search` | `query` (≥ 3 znaki; symbol, nazwa lub NIP), `limit` (≤ 50) | `{ id, symbol, name, nip, email, documents_12m, gross_12m }` | `kh__Kontrahent`, `adr__Ewid` (`adr_TypAdresu = 1`) | `contractors:read` | `GET /api/contractors?query=` |
| `contractor_history` | `contractor_id`, `from?`, `to?`, `limit` | dokumenty kontrahenta jak `sales_documents` + sumy | jak wyżej | `contractors:read` | `GET /api/contractors/:id/documents` |
| `receivables_open` | `as_of?` (domyślnie dziś), `min_days_overdue?`, `limit` | `{ document, contractor_name, contractor_nip, gross_total, remaining, due_date, days_overdue }` + suma | `nz__Finanse` (`nzf_Typ = 39`, `nzf_Wartosc > 0`, `nzf_TerminPlatnosci` — kolumna do potwierdzenia sondą) | `finance:read` | `GET /api/receivables` |
| `describe_tools` | — | lista narzędzi z opisami i przykładami pytań | — | dowolny | `GET /api/tools` |

Loop 3 (po sondzie, opcjonalnie): `stock_levels` (`tw_Stan`: `st_TowId`, `st_MagId`, `st_Stan`, `st_StanRez` — hipoteza), `sales_by_salesperson` (`dok_PersonelId` → `pd__Personel` — hipoteza), `unfiscalized_invoices` (`from`, `to`, `limit` → FS nabywcy bez NIP, bez znacznika fiskalizacji, bez paragonu w łańcuchu i bez statusu KSeF „wysłana”: `{ id, number, issued_at, warehouse_symbol, contractor_name, gross_total, has_receipt, fiscal_marker, ksef_status }` + lista `ksef_with_receipt` (FS w KSeF z paragonem w łańcuchu) + liczniki `excluded_by_nip`, `excluded_by_receipt`, `excluded_by_ksef`; scope `finance:read`; kolumny znacznika i KSeF wg §6 pkt 3). Bez potwierdzenia kolumn przez `--probe` narzędzie nie powstaje.

**Błędy** (MCP `isError: true` + REST `4xx/5xx` z `{ error: { code, message } }`): `INVALID_INPUT` (zod), `RANGE_TOO_WIDE`, `LIMIT_EXCEEDED`, `RATE_LIMITED` (429), `UNAUTHORIZED` (401), `FORBIDDEN_SCOPE` (403), `DB_UNAVAILABLE` (503), `QUERY_TIMEOUT` (504). Komunikaty po polsku, bez treści SQL i bez stack trace.

### 2.2 Konfiguracja (`.env` na `SERWER`)

```
SUBIEKT_DB_SERVER=localhost
SUBIEKT_DB_INSTANCE=INSERTGT
SUBIEKT_DB_NAME=WD_sp
SUBIEKT_DB_USER=portal_reader
SUBIEKT_DB_PASSWORD=…
BRIDGE_BIND=127.0.0.1
BRIDGE_PORT=8787
BRIDGE_TOKENS=walldecor-app:sales:read,finance:read:<sha256>;piotr-claude:sales:read,documents:read,contractors:read,finance:read:<sha256>
BRIDGE_RATE_LIMIT_PER_MIN=60
BRIDGE_MAX_ROWS=500
BRIDGE_QUERY_TIMEOUT_MS=30000
BRIDGE_CACHE_TTL_S=60
BRIDGE_LOG_RETENTION_DAYS=180
```

Tokeny generuje `node dist/main.js --new-token <nazwa> --scopes sales:read,…`: wypisuje token raz (do schowka użytkownika) i linię do wklejenia w `BRIDGE_TOKENS`. Zmiana tokena = restart serwisu.

### 2.3 Sieć

- `SERWER`: Tailscale (klucz logowania użytkownika, urządzenie oznaczone tagiem `tag:bridge`), `tailscale serve --bg --https=443 http://127.0.0.1:8787` → `https://serwer.<tailnet>.ts.net/mcp` i `/api/*`. Certyfikat i odnowienie robi Tailscale.
- VPS Coolify (51.83.197.9): Tailscale na hoście; kontener WallDecor-App dochodzi do adresu tailnetu przez NAT hosta (sprawdzane w Loopie 0 z wnętrza kontenera: `curl https://serwer.<tailnet>.ts.net/health`). Jeśli nie działa — ACL/`--accept-routes` albo fallback z decyzji 3.
- Mac użytkownika: już w tailnecie (Claude Code, Claude Desktop). ACL tailnetu: `tag:bridge` przyjmuje port 443 tylko z urządzeń użytkownika i z VPS.
- Klienci MCP: Claude Code — `claude mcp add --transport http walldecor-bridge https://serwer.<tailnet>.ts.net/mcp --header "Authorization: Bearer $WALLDECOR_BRIDGE_TOKEN"`; Claude Desktop — wpis stdio `npx -y mcp-remote https://…/mcp --header "Authorization: Bearer ${WALLDECOR_BRIDGE_TOKEN}"` w `claude_desktop_config.json` (łączniki zdalne Claude.ai wymagają publicznego URL, więc dla tailnetu zostaje proxy stdio); Codex CLI użytkownika (poza WallDecor-App) — `[mcp_servers.walldecor_bridge] url = "…/mcp" bearer_token_env_var = "WALLDECOR_BRIDGE_TOKEN"` w `~/.codex/config.toml`.

### 2.4 Strona WallDecor-App (Loop 4)

- `.env`: `SUBIEKT_BRIDGE_URL=https://serwer.<tailnet>.ts.net`, `SUBIEKT_BRIDGE_TOKEN=…` (nigdy `NEXT_PUBLIC_`), `SUBIEKT_BRIDGE_WAREHOUSE_MAP=PUŁ:PUL,MAG:JAG` (symbol magazynu GT → `CostCenter.id`; opcjonalny trzeci segment wymusza kanał, np. `INT:PUL:ECOMMERCE` dla przyszłego magazynu internetowego; bez trzeciego segmentu kanał wynika z rodzaju pozycji: towar → `SALON`, usługa → `MONTAZ`), `SUBIEKT_BRIDGE_AUTO_SYNC=on|off`. Magazyn spoza mapy nie jest pomijany po cichu: trafia do snapshotu jako `costCenterId = null` i UI pokazuje ostrzeżenie „nieprzypisany magazyn X: kwota”.
- Nowa tabela `SubiektRevenueSnapshot` (migracja `prisma/migrations/<ts>_subiekt_revenue_snapshot/migration.sql`): `id`, `year`, `month`, `costCenterId`, `channel`, `grossAmount Float`, `netAmount Float`, `documentCount Int`, `fetchedAt DateTime`, `sourceHash String`, `@@unique([year, month, costCenterId, channel])`. Przechowuje ostatni odczyt z mostka; `Revenue` zmienia się tylko po „Zastosuj” (ADMIN).
- `src/lib/finance/subiekt-bridge-client.ts` (fetch z tokenem, timeout 20 s, mapowanie błędów), `src/lib/finance/subiekt-revenue.ts` (odczyt → mapowanie magazyn/rodzaj → centrum/kanał → upsert snapshotów; `applySubiektRevenue(year, month, costCenterId, channel)` → upsert `Revenue` z `asOfDate` = ostatni dzień miesiąca lub dziś dla bieżącego), harmonogram w `src/instrumentation.ts` jak `ksef-auto-sync.ts` (07:30 Europe/Warsaw, slot w `AppSetting`), UI na `/finance/revenue`: kolumna „Subiekt” obok wpisanej kwoty, różnica, przycisk „Zastosuj” per komórka i „Zastosuj wszystkie w miesiącu”, znacznik czasu ostatniego odczytu, przycisk „Odczytaj teraz” (ADMIN), komunikat gdy mostek niedostępny (dane z ostatniego snapshotu z datą).

---

## 3. Struktura plików (repo `walldecor-bridge`)

```
walldecor-bridge/
  package.json            # mssql, @modelcontextprotocol/sdk, zod; scripts: build, typecheck, test, start, probe, new-token
  tsconfig.json
  .env.example
  README.md               # instalacja na SERWER krok po kroku (wzór: agent-subiekt/README.md)
  install-service.ps1     # zadanie Harmonogramu „WallDecor Bridge”: przy uruchomieniu systemu, restart co 1 min przy awarii, konto użytkownika
  uninstall-service.ps1
  src/
    main.ts               # tryby: serve (domyślny) | --probe | --new-token | --help; kody wyjścia jak agent
    config.ts             # z agent-subiekt (parseEnvFile, DbConfig) + BRIDGE_*
    db.ts                 # z agent-subiekt (pool readOnlyIntent, queryRows, params)
    probe.ts              # z agent-subiekt + REQUIRED_COLUMNS mostka (sl_Magazyn, dok_MagId, nzf_TerminPlatnosci, …)
    auth.ts               # parsowanie BRIDGE_TOKENS, sha256, scope check, rate limit (okno 60 s per token)
    audit.ts              # calls-RRRR-MM-DD.jsonl + retencja
    cache.ts              # LRU z TTL per (narzędzie, parametry) — 60 s
    queries/
      sales.ts            # sales_summary, sales_documents, top_products
      documents.ts        # document_detail (+ chain)
      contractors.ts      # contractor_search, contractor_history
      receivables.ts      # receivables_open
      columns.ts          # REQUIRED_COLUMNS mostka (sonda)
    tools/
      registry.ts         # definicja narzędzia = { name, description, scope, input: zod, run } — jedna lista dla MCP i REST
      *.ts                # po jednym pliku na narzędzie; mapowanie wierszy → JSON + tekst podsumowania
    http/
      server.ts           # node:http na 127.0.0.1:8787, routing /health, /mcp, /api/*, /status
      mcp.ts              # McpServer + StreamableHTTPServerTransport (sesje lub stateless), rejestracja narzędzi z registry
      rest.ts             # /api/* → to samo registry; query string → walidacja zod → run
      status.ts           # /status (HTML, wymaga tokena): wersja, uptime, baza up/down, ostatnie 50 wywołań z logu, limity
  tests/
    *.test.ts             # node:test; SQL Edge w Dockerze dla testów zapytań (docker compose w tests/docker/)
    e2e/
      mcp-client.test.ts  # klient MCP z SDK łączy się po HTTP, listuje narzędzia, wywołuje sales_summary → wynik równy SELECT z sqlcmd
```

---

## 4. Loopy

### Loop 0 — Sieć, repo, decyzje techniczne (bez logiki danych)

**Cel:** z Maca, z VPS (z wnętrza kontenera WallDecor-App) i z `SERWER` da się wywołać `GET /health` mostka przez tailnet i dostać `{ ok: true, version, db: "down" }` (jeszcze bez bazy), a `GET /api/tools` bez tokena zwraca 401.

Zadania:
1. Repo `walldecor-bridge` (prywatne), `package.json` z przypiętymi wersjami po `npm view` (`mssql`, `@modelcontextprotocol/sdk` **albo** `@modelcontextprotocol/server` — wybór po przeczytaniu dokumentacji transportu HTTP obu linii; zapisać decyzję w README sekcja „Decyzje”), `zod`, `typescript`, `@types/node`. Skopiować `config.ts`, `db.ts`, `probe.ts`, `queries.ts → queries/columns.ts` z `agent-subiekt/src/` (z adnotacją pochodzenia i commitu).
2. `http/server.ts`: `/health` (bez tokena), `/api/tools` (token), reszta 404. `auth.ts` z `BRIDGE_TOKENS` i `--new-token`.
3. Tailscale: instalacja na `SERWER` i na VPS Coolify (użytkownik, według README sekcja „Sieć”); `tailscale serve` na `SERWER`; ACL z tagiem `tag:bridge`.
4. Test z trzech miejsc: Mac (`curl`), VPS host (`curl`), kontener WallDecor-App (`docker exec <ctr> curl …` lub Coolify „Execute command”). Jeśli kontener nie dochodzi — zapisać przyczynę i wybrać fallback (decyzja 3) **przed** Loopem 1.

Świadomie poza zakresem: baza GT, narzędzia, UI.

**DoD:**
- [ ] Użytkownik na Macu: `curl -s https://serwer.<tailnet>.ts.net/health` → 200, JSON z `version` równą `package.json`.
- [ ] Z wnętrza kontenera WallDecor-App ten sam `curl` → 200 (albo udokumentowany fallback z działającym `curl`).
- [ ] `curl …/api/tools` bez nagłówka → 401; ze złym tokenem → 401; z tokenem z `--new-token` → 200 i pusta lista narzędzi `[]`.
- [ ] `curl http://51.83.197.9:8787/health` z Internetu i `curl https://<publiczny adres SERWER>` → brak odpowiedzi (port nie wystawiony).
- [ ] Zadanie Harmonogramu „WallDecor Bridge” po `Restart-Computer` na `SERWER` uruchamia serwis bez logowania użytkownika (po restarcie `/health` odpowiada w ≤ 2 min).

**Bramka:** `npm test && npm run typecheck && npm run build`; walidator `scripts/validate-loop0.sh` wykonuje 4 wywołania `curl` z DoD i porównuje kody; DOWÓD z wyjściem `curl` z trzech miejsc i zrzutem Harmonogramu.

---

### Loop 1 — Szkielet end-to-end: jedno narzędzie z prawdziwej bazy przez MCP i REST

**Cel:** użytkownik w Claude Code pyta „jaka była sprzedaż brutto w październiku 2026 per salon?”, model wywołuje `sales_summary` i odpowiada liczbą równą wynikowi tego samego zapytania w SSMS.

Zadania:
1. `--probe` mostka: `REQUIRED_COLUMNS` agenta + `dok__Dokument.dok_MagId`, `sl_Magazyn (mag_Id, mag_Symbol, mag_Nazwa)`, `dok_Pozycja.ob_WartBrutto`, `nz__Finanse.nzf_TerminPlatnosci` (hipoteza), `tw_Stan`, `pd__Personel` (opcjonalne, raportowane jako „brak = narzędzie nie powstanie”). Sonda wypisuje: magazyny (symbol, nazwa, liczba FS/PA w 12 mies.), liczność FS/KFS/PA wg `dok_Podtyp` i `dok_Status`, 5 przykładów FS z `dok_DoDokId` wskazującym PA (faktura do paragonu). Raport `logs/probe-RRRR-MM-DD.txt` — użytkownik odsyła (wejście do §6 pkt 1–3).
2. `tools/registry.ts` + `tools/sales_summary.ts` + `queries/sales.ts` (agregacja po nagłówkach dla `month`/`month_warehouse`; po pozycjach dla `month_warehouse_kind` z `ob_TowRodzaj`; KFS ujemne wliczone; `dok_Status` filtr wg wyniku sondy, do tego czasu bez filtra z ostrzeżeniem w opisie narzędzia).
3. `http/mcp.ts` (Streamable HTTP, auth przed transportem, scope per narzędzie), `http/rest.ts` (`GET /api/sales/summary`), `audit.ts`, `cache.ts`, limity z §0 pkt 5.
4. Testy: `tests/docker/` z Azure SQL Edge i skryptem seedującym minimalny schemat GT (tabele i kolumny z `REQUIRED_COLUMNS`, 2 magazyny, FS/KFS/PA z pozycjami towar/usługa, należności) — reużyć fixture z Loopu 5 planu Subiekta jeśli istnieje w `agent-subiekt/tests/`; test zapytania `sales_summary` porównuje wynik z ręcznie policzoną sumą seeda; test `UPDATE dbo.dok__Dokument` przez pool mostka → błąd uprawnień (login testowy z `DENY` jak w produkcji); test auth (401/403/429); e2e `tests/e2e/mcp-client.test.ts` klientem z SDK po HTTP (lista narzędzi = `["sales_summary"]`, wywołanie, `structuredContent` zgodny z REST dla tych samych parametrów).
5. Na `SERWER`: aktualizacja z repo, `npm ci && npm run build`, restart zadania; użytkownik dodaje serwer w Claude Code (§2.3) i zadaje pytanie; równolegle w SSMS: `SELECT dok_MagId, SUM(dok_WartBrutto) FROM dok__Dokument WHERE dok_Typ IN (2,6,21) AND dok_DataWyst >= '2026-10-01' AND dok_DataWyst < '2026-11-01' GROUP BY dok_MagId`.

Świadomie poza zakresem: pozostałe narzędzia, strona `/status`, WallDecor-App.

**DoD:**
- [ ] `node dist/main.js --probe` na `SERWER` kończy się kodem 0 dla kolumn obowiązkowych i wypisuje magazyny z liczbą dokumentów; raport odesłany.
- [ ] Użytkownik w Claude Code zadaje pytanie o sprzedaż brutto za październik 2026 per salon; odpowiedź zawiera kwoty równe (do 0,01) wynikowi zapytania SSMS; w `logs/calls-*.jsonl` jest wiersz z `tool: "sales_summary"`, nazwą tokena i liczbą wierszy.
- [ ] `curl -H "Authorization: Bearer …" "https://…/api/sales/summary?from=2026-10-01&to=2026-10-31&group_by=month_warehouse"` zwraca ten sam JSON co `structuredContent` z MCP.
- [ ] Zakres 25 miesięcy → błąd `RANGE_TOO_WIDE` po polsku; 61 wywołań w minucie → 429; token bez `sales:read` → 403.
- [ ] Test `UPDATE` przez pool kończy się błędem uprawnień (zielony test).
- [ ] Po `Restart-Computer` na `SERWER` to samo pytanie w Claude Code działa bez ingerencji.

**Bramka:** `npm test` (w tym e2e z SQL Edge) `&& npm run typecheck && npm run build`; walidator `scripts/validate-loop1.sh`: uruchamia mostek na SQL Edge, wywołuje REST i MCP, porównuje sumy z `sqlcmd`, sprawdza 401/403/429 i że `grep -rn "req.query\|params\." src/queries` nic nie zwraca (parametry nie trafiają do tekstu SQL). DOWÓD: transkrypt Claude Code, wynik SSMS, wiersz z `calls-*.jsonl`.

---

### Loop 2 — Komplet narzędzi dla czatu: dokumenty, kontrahenci, należności, strona statusu

**Cel:** użytkownik pyta w Claude Code „pokaż fakturę FS 185/PUŁ/10/2026 z pozycjami i korektami”, „ile zalega nam Kowalski”, „kto ma przeterminowane należności powyżej 30 dni”, „top 10 produktów w 3. kwartale” i dostaje odpowiedzi z bazy; na `/status` widzi, czy mostek żyje i co ostatnio robił.

Zadania:
1. Narzędzia z §2.1: `sales_documents`, `document_detail` (łańcuch w górę i w dół po `dok_DoDokId`, pozycje KFS wg konwencji agenta: `ob_Znak`), `top_products`, `contractor_search`, `contractor_history`, `receivables_open` (kolumna terminu wg sondy; brak → narzędzie zwraca `remaining` bez `days_overdue` i mówi to w opisie), `describe_tools`.
2. REST dla każdego (§2.1), ten sam `registry`.
3. `/status` (HTML, token w nagłówku lub w `?token=` tylko dla tej strony, bez JS zewnętrznego): wersja, uptime, stan bazy z czasem ostatniego udanego zapytania, 50 ostatnich wywołań z logu (czas, token, narzędzie, wiersze, ms, wynik), licznik 429 z ostatniej godziny. Każdy element na stronie wyświetla dane z procesu/logu — bez atrap.
4. Testy jednostkowe na SQL Edge per narzędzie (w tym: `contractor_search` po NIP z kreskami, `document_detail` po numerze z polskimi znakami `PUŁ`, `receivables_open` dla należności częściowo spłaconej), e2e MCP: `tools/list` zwraca 8 narzędzi, każde wywołane raz.

Świadomie poza zakresem: stany magazynowe i personel (Loop 3), WallDecor-App.

**DoD:**
- [ ] Każde z 7 pytań-przykładów z `describe_tools` zadane w Claude Code daje odpowiedź z danymi, a w logu jest wywołanie właściwego narzędzia (7 wierszy).
- [ ] `document_detail` dla KFS 6/PUŁ/10/2026 (31243) pokazuje rodzica FS 185/PUŁ/10/2026 i kwotę −3741,50.
- [ ] `receivables_open` sumuje się do tej samej kwoty co SSMS: `SELECT SUM(nzf_Wartosc) FROM nz__Finanse WHERE nzf_Typ = 39 AND nzf_Wartosc > 0`.
- [ ] `/status` otwarte w przeglądarce na Macu pokazuje ostatnie wywołania z poprzedniego punktu; bez tokena → 401.
- [ ] Zapytanie `contractor_search` z `query` o długości 2 → `INVALID_INPUT`; `limit=1000` → `LIMIT_EXCEEDED`.
- [ ] Nazwy kontrahentów nie występują w `calls-*.jsonl` (`grep` po nazwie użytej w pytaniu zwraca 0 wierszy).

**Bramka:** jak Loop 1 + walidator `validate-loop2.sh` wywołuje każde narzędzie przez REST i MCP na SQL Edge i porównuje z `sqlcmd`. DOWÓD: transkrypty, zrzut `/status`, wyniki SSMS.

---

### Loop 3 — Narzędzia warunkowe po sondzie (opcjonalny)

**Cel:** jeśli sonda potwierdziła kolumny, użytkownik pyta „jaki jest stan magazynowy szyny techno 15 na Puławskiej”, „sprzedaż per handlowiec w październiku” oraz „które faktury dla osób prywatnych z października nie mają paragonu” i dostaje listy z bazy.

Zadania: `stock_levels`, `sales_by_salesperson`, `unfiscalized_invoices` wg §2.1 (dokładne kolumny z raportu sondy wpisane do `queries/columns.ts`); testy i REST jak wyżej. Dla `unfiscalized_invoices` test na SQL Edge: FS bez NIP z paragonem w łańcuchu → poza listą; FS bez NIP bez paragonu i bez znacznika → na liście; FS z NIP → poza listą; FS bez NIP wysłana do KSeF → poza listą, licznik `excluded_by_ksef` = 1; FS wysłana do KSeF z paragonem w łańcuchu → w `ksef_with_receipt`; KFS nigdy na liście. Gdy sonda nie potwierdzi kolumn KSeF, narzędzie powstaje bez kryterium KSeF, a `ksef_status` ma wartość `"unknown"` i opis narzędzia o tym mówi. Jeśli sonda nie potwierdziła kolumn — dane narzędzie zamknięte wpisem „pominięte: brak kolumn X, Y” w README i w tym planie (pozostałe powstają).

**DoD:** każde narzędzie odpowiada liczbą zgodną z GT (użytkownik sprawdza w oknie Subiekta: karta towaru → stan; raport sprzedaży wg personelu; dla fiskalizacji — ręczne otwarcie 3 wskazanych FS w GT i potwierdzenie, że nie mają paragonu ani znacznika). Bramka jak Loop 2.

---

### Loop 4 — WallDecor-App: przychody z Subiekta obok ręcznych, „Zastosuj”

**Cel:** ADMIN na `/finance/revenue` widzi przy każdej komórce miesiąc × salon × kanał kwotę brutto z Subiekta i różnicę względem wpisanej; klika „Zastosuj” i wpisana kwota zmienia się na kwotę z Subiekta (zapis w `Revenue`), co widać też na dashboardzie i w P&L.

Warunek wstępny: §6 pkt 3 (filtr paragon/FS do paragonu) rozstrzygnięty na podstawie zapytań SSMS i raportu sondy z Loopa 1; pkt 1–2 rozstrzygnięte 2026-11-01 (decyzje 6a, 6b).

Zadania (repo `walldecor-app`, gałąź `feat/subiekt-bridge-revenue`):
1. Migracja `SubiektRevenueSnapshot` (§2.4), klient `subiekt-bridge-client.ts`, serwis `subiekt-revenue.ts` (odczyt `sales_summary` `month_warehouse_kind` za ostatnie 13 miesięcy → mapowanie → upsert snapshotów; `applySubiektRevenue` → upsert `Revenue` przez istniejącą walidację `RevenueEntrySchema`, bez omijania `COST_CENTER_CHANNELS`).
2. Harmonogram w `src/instrumentation.ts` 07:30 Europe/Warsaw (wzór `ksef-auto-sync.ts`: slot w `AppSetting`, blokada na `globalThis`, wyłącznik env `SUBIEKT_BRIDGE_AUTO_SYNC=off`).
3. UI `/finance/revenue`: kolumna „Subiekt” (kwota, liczba dokumentów, czas odczytu), różnica z kolorem, „Zastosuj” per komórka, „Zastosuj wszystkie w miesiącu”, „Odczytaj teraz” (server action, ADMIN), stan „mostek niedostępny — dane z <data>” gdy fetch padł. STAFF/MANAGER widzą kolumnę, bez przycisków (zgodnie z `finance-access.ts`).
4. `finance-context.ts`: do kontekstu czatu finansowego dodać blok `subiektRevenue` (miesiąc, salon, kanał, kwota, różnica względem `Revenue`) z instrukcją interpretacji po polsku; bez wywołań sieciowych z workera.
5. Testy: Vitest dla mapowania (magazyn/rodzaj → centrum/kanał; wpis `INT:PUL:ECOMMERCE` kieruje towar i usługę z `INT` do `ECOMMERCE`; magazyn spoza mapy → `costCenterId = null` + ostrzeżenie; KFS ujemne; miesiąc bez dokumentów → brak snapshotu, nie zero), dla `applySubiektRevenue` (upsert, `asOfDate`), dla klienta (401/503/timeout → błąd domenowy); Playwright `e2e/finance-revenue-subiekt.spec.ts` z mockiem mostka na porcie lokalnym (serwer testowy zwracający JSON z fixture): logowanie ADMIN → kolumna widoczna → „Zastosuj” → wartość w komórce i w bazie (`sqlite3`) → odświeżenie strony → nadal.

Świadomie poza zakresem: automatyczne nadpisywanie `Revenue` bez kliknięcia (tylko podpowiedź), przychody per produkt, koszty.

**DoD:**
- [ ] ADMIN otwiera `/finance/revenue` → przy komórce 2026-10 / PUL / SALON widzi kwotę z Subiekta równą wynikowi `sales_summary` (`month_warehouse_kind`, magazyn `PUŁ`, `TOWAR`) i różnicę względem wpisanej.
- [ ] Klik „Zastosuj” → `SELECT amount, asOfDate FROM Revenue WHERE year=2026 AND month=10 AND costCenterId='PUL' AND channel='SALON'` zwraca kwotę z Subiekta; dashboard P&L pokazuje nową kwotę; po restarcie kontenera wartość jest.
- [ ] Zatrzymanie mostka → strona pokazuje „mostek niedostępny — dane z <data>”, przycisk „Zastosuj” nadal działa na ostatnim snapshocie, „Odczytaj teraz” pokazuje błąd po polsku, bez stack trace.
- [ ] Użytkownik z rolą bez `finance-access` nie widzi przycisków, a wywołanie server action z jego sesji zwraca odmowę.
- [ ] Harmonogram: po ręcznym przestawieniu slotu w `AppSetting` i restarcie `next dev` w logu jest wpis o odczycie i `fetchedAt` snapshotów jest nowe.
- [ ] Czat finansowy (ADMIN) na pytanie „czym różni się przychód Puławskiej w październiku od Subiekta?” odpowiada kwotą różnicy z kontekstu (worker nie łączy się z mostkiem: w `calls-*.jsonl` mostka brak wywołań z tokena `walldecor-app` w czasie pytania poza harmonogramem).

**Bramka:** `npm test && npm run typecheck:app && npm run build && npm run test:e2e -- finance-revenue-subiekt` zielone; walidator `scripts/validate-subiekt-revenue.mjs`: uruchamia mock mostka, woła server action, czyta `Revenue` z bazy, porównuje. DOWÓD: zrzuty ekranu, wiersz z bazy, log harmonogramu.

---

### Loop 5 — Konfiguracja klientów użytkownika i instrukcja

**Cel:** użytkownik na Macu ma działające połączenie z mostkiem w Claude Code, Claude Desktop i Codex CLI, a README prowadzi od zera (nowy komputer, nowy token) do pierwszej odpowiedzi.

Zadania: README sekcje „Klienci” (§2.3 krok po kroku), „Tokeny” (nadanie, odwołanie, rotacja: dodaj nowy → przełącz klientów → usuń stary → restart), „Awaria” (gdzie logi, kody wyjścia jak agent, co sprawdzić gdy `/health` `db: "down"`), „Aktualizacja” (`git pull && npm ci && npm run build && Restart-ScheduledTask`). Przykładowe pytania po polsku w `describe_tools` i README.

**DoD:**
- [ ] Trzej klienci (Claude Code, Claude Desktop przez `mcp-remote`, Codex CLI) listują 8 narzędzi i wykonują `sales_summary` — w logu mostka 3 wywołania z tym samym tokenem.
- [ ] Odwołanie tokena (usunięcie z `BRIDGE_TOKENS` + restart) → ten sam klient dostaje 401; nowy token działa.
- [ ] Osoba bez wiedzy o projekcie wykonuje README od sekcji „Klienci” i dostaje odpowiedź w Claude Code w ≤ 15 min (test z użytkownikiem).

**Bramka:** jak Loop 2 + DOWÓD z trzema transkryptami.

---

### Loop 6 — Scenariusz końcowy „dzień z życia właściciela” (na danych produkcyjnych GT, WallDecor-App na dev z prawdziwym mostkiem)

Jeden przebieg bez dotykania bazy ręcznie i bez trafienia na martwy element:

1. 07:30 — harmonogram WallDecor-App (dev z `SUBIEKT_BRIDGE_URL` produkcyjnego mostka) odczytuje przychody; log zawiera wpis z liczbą snapshotów.
2. ADMIN loguje się do WallDecor-App, otwiera `/finance/revenue`, widzi kolumnę „Subiekt” za bieżący i poprzedni miesiąc, klika „Zastosuj wszystkie” dla poprzedniego miesiąca; P&L i dashboard pokazują nowe kwoty.
3. ADMIN pyta czat finansowy o różnicę między wpisanym a Subiektem za bieżący miesiąc — odpowiedź zgodna z kolumną.
4. Użytkownik w Claude Code: „jaka była sprzedaż w tym tygodniu per salon i kanał”, „pokaż ostatnią fakturę dla <kontrahent>”, „kto zalega powyżej 30 dni”, „top 5 produktów w tym miesiącu” — cztery odpowiedzi z danymi; `/status` pokazuje te 4 wywołania.
5. Użytkownik wyłącza Wi‑Fi Maca → Claude Code zgłasza brak połączenia z mostkiem (nie wiesza się); włącza → działa.
6. Restart `SERWER` → w ≤ 2 min `/health` ok; ponowne pytanie działa.
7. Kontrola: `calls-*.jsonl` nie zawiera nazw kontrahentów; port 8787 niedostępny z LAN biura spoza `SERWER` (`curl http://192.168.1.150:8787/health` z drugiego komputera → brak odpowiedzi).

**DoD:** wszystkie 7 kroków wykonane bez błędu; DOWÓD = transkrypty, zrzuty, wiersze z baz, wynik `curl` z LAN. Dopiero po tym loopie Loop 7.

---

### Loop 7 — Wdrożenie strony WallDecor-App na produkcję (wyłącznie na polecenie użytkownika)

- [ ] Tailscale na VPS Coolify potwierdzony w Loopie 0; ACL ogranicza `tag:bridge` do VPS i urządzeń użytkownika.
- [ ] W Coolify (app `pwc0sk0w8cw8k8wkgwokgogk`): `SUBIEKT_BRIDGE_URL`, `SUBIEKT_BRIDGE_TOKEN` (token z scope `sales:read` tylko), `SUBIEKT_BRIDGE_WAREHOUSE_MAP`, `SUBIEKT_BRIDGE_AUTO_SYNC=on`.
- [ ] Merge PR, deploy, `prisma migrate deploy` w entrypoint dodaje `SubiektRevenueSnapshot` (log startu).
- [ ] Smoke: „Odczytaj teraz” na produkcji → snapshoty; porównanie 2 miesięcy z raportem sprzedaży w GT (Subiekt → Raporty → Sprzedaż wg magazynów) — różnice wyjaśnione przed „Zastosuj”.
- [ ] Pierwsze „Zastosuj” tylko dla zamkniętego miesiąca, po akceptacji użytkownika.
- [ ] Aktualizacja `PROGRESS.md`/`project_status.md` WallDecor-App i pamięci (`project-subiekt-mcp-idea` → stan wdrożenia).

---

## 5. Checklist audytu atrap (przed oznaczeniem KAŻDEGO loopa jako done)

- [ ] Każde narzędzie z `tools/list` wywołane przynajmniej raz na prawdziwej bazie i odpowiedź porównana z SSMS lub oknem Subiekta.
- [ ] Każdy widoczny element na `/status` i na `/finance/revenue` kliknięty; coś robi albo go nie ma.
- [ ] „Zastosuj” sprawdzone w bazie (`Revenue`), nie tylko na ekranie; po restarcie aplikacji wartość jest.
- [ ] Wyłączony mostek: aplikacja i klienci MCP pokazują czytelny błąd, nic się nie wiesza.
- [ ] Token bez zakresu → 403; brak tokena → 401; port 8787 niewidoczny poza `SERWER`.
- [ ] `grep -rn "sql\|query" src/tools src/http` w mostku nie pokazuje tekstu SQL budowanego z wejścia klienta.
- [ ] Log wywołań nie zawiera nazw kontrahentów ani treści Uwag.
- [ ] Raport loopa zawiera komendy, wyniki, transkrypty, zrzuty.

---

## 6. Otwarte pytania do rozstrzygnięcia w trakcie (nie blokują Loopów 0–3)

1. **[Rozstrzygnięte 2026-11-01 — decyzja 6a.]** Mapowanie magazynów: `MAG` = Jagiellońska (`JAG`), `PUŁ` = Puławska (`PUL`). Sonda Loopa 1 potwierdza tylko, że `sl_Magazyn.mag_Symbol` ma te wartości i że nie ma trzeciego magazynu z dokumentami sprzedaży.
2. **[Rozstrzygnięte 2026-11-01 — decyzja 6b.]** E-commerce na razie zgrupowane z Puławską, kanał `ECOMMERCE` ręczny; przyszły magazyn `INT` obsłużony wpisem mapy `INT:PUL:ECOMMERCE`.
3. **Paragony i faktury do paragonu — do sprawdzenia w SSMS przed Loopem 1 (użytkownik, login `portal_reader`).** Kierunek użytkownika: wykluczać faktury detaliczne jak w raportach GT, ale najpierw sprawdzić, czy FS z wydrukowanym paragonem mają w bazie własny znacznik. Zapytania (wyniki wkleić do tego punktu):

   ```sql
   -- A. Kolumny (w całej bazie), które mogą oznaczać fiskalizację / fakturę detaliczną / status KSeF
   SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
   WHERE COLUMN_NAME LIKE '%Fisk%' OR COLUMN_NAME LIKE '%Parag%' OR COLUMN_NAME LIKE '%Detal%'
      OR COLUMN_NAME LIKE '%KSeF%' OR COLUMN_NAME LIKE '%Ksef%' OR (TABLE_NAME = 'dok__Dokument' AND COLUMN_NAME LIKE '%Podtyp%')
   ORDER BY TABLE_NAME, COLUMN_NAME;

   -- B. Podtypy FS (2) i PA (21) z 12 miesięcy: liczność, suma brutto, ile ma dok_DoDokId wskazujący paragon
   SELECT d.dok_Typ, d.dok_Podtyp, COUNT(*) AS ile, SUM(d.dok_WartBrutto) AS brutto,
          SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS do_paragonu
   FROM dbo.dok__Dokument d LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
   WHERE d.dok_Typ IN (2, 21) AND d.dok_DataWyst >= DATEADD(month, -12, GETDATE())
   GROUP BY d.dok_Typ, d.dok_Podtyp ORDER BY d.dok_Typ, d.dok_Podtyp;

   -- C. Przykłady FS wystawionych do paragonu (numer FS, numer PA, kwoty, podtyp) — 10 najnowszych
   SELECT TOP 10 d.dok_NrPelny AS fs, d.dok_Podtyp, d.dok_WartBrutto, p.dok_NrPelny AS pa, p.dok_WartBrutto AS pa_brutto
   FROM dbo.dok__Dokument d JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
   WHERE d.dok_Typ = 2 AND p.dok_Typ = 21 ORDER BY d.dok_DataWyst DESC;

   -- D. Czy istnieją zwroty do paragonu / inne typy detaliczne (wszystkie dok_Typ z 12 miesięcy)
   SELECT dok_Typ, COUNT(*) AS ile, MIN(dok_NrPelny) AS przyklad
   FROM dbo.dok__Dokument WHERE dok_DataWyst >= DATEADD(month, -12, GETDATE())
   GROUP BY dok_Typ ORDER BY dok_Typ;

   -- E. FS dla nabywcy bez NIP (kandydaci do kontroli fiskalizacji) z 3 miesięcy: ile ma paragon w łańcuchu
   SELECT COUNT(*) AS fs_bez_nip,
          SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS z_paragonem
   FROM dbo.dok__Dokument d
   JOIN dbo.adrh__Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
   LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
   WHERE d.dok_Typ = 2 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
     AND (a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '');

   -- F. (po wyniku A: wstawić nazwę tabeli/kolumny statusu KSeF, np. <KSEF_TABELA>.<KSEF_STATUS>)
   -- Ile FS z 3 miesięcy jest wysłanych do KSeF, ile z nich ma nabywcę bez NIP (faktury konsumenckie w KSeF?),
   -- ile wysłanych do KSeF ma paragon w łańcuchu (anomalia wg decyzji 7a)
   SELECT COUNT(*) AS fs_w_ksef,
          SUM(CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 1 ELSE 0 END) AS bez_nip,
          SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS z_paragonem
   FROM dbo.dok__Dokument d
   JOIN dbo.adrh__Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
   LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
   -- JOIN dbo.<KSEF_TABELA> k ON k.<KSEF_DOK_ID> = d.dok_Id AND k.<KSEF_STATUS> = <wartość „wysłana/przyjęta”>
   WHERE d.dok_Typ = 2 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE());
   ```

   Decyzja po wynikach: (i) jeśli jest kolumna znacznika (A) — filtr `sales_summary` wyklucza FS ze znacznikiem lub z `dok_DoDokId` → PA, paragony zostają; (ii) jeśli nie ma — wyklucza FS z `dok_DoDokId` → PA, a FS detaliczne bez powiązania liczy jak zwykłe i raportuje liczność w `describe_tools`. Ta sama kolumna zasila `unfiscalized_invoices` (decyzja 7a); kolumny KSeF z A i liczności z F rozstrzygają, czy kryterium KSeF wchodzi do narzędzia (jeśli `bez_nip` w F jest > 0, firma wysyła faktury konsumenckie do KSeF i kryterium wymaga doprecyzowania z użytkownikiem). **Blokuje Loop 4 (nie blokuje Loopów 0–3).**
4. **Podtypy FS 3, 4, 5** (podejrzenie: zaliczkowe/końcowe; §6 pkt 13 planu Subiekta) — do przychodu liczyć końcowe z pełną kwotą czy zaliczkowe w dacie wpłaty? Decyzja z księgowością; do czasu decyzji `sales_summary` pokazuje podtypy osobno w `describe_tools` jako ostrzeżenie.
5. **Data przychodu:** `dok_DataWyst` czy data sprzedaży (`dok_DataSprzedazy`, jeśli istnieje) — dla przychodu brutto w WallDecor-App; domyślnie `dok_DataWyst`.
6. **`dok_Status`** — czy dokumenty anulowane/odłożone mają osobny status do wykluczenia (§6 pkt 17 planu Subiekta; liczność w sondzie).
7. **Wersja SDK MCP** (v1 `@modelcontextprotocol/sdk` 1.32.x vs v2 `@modelcontextprotocol/server` 2.4.0) — po przeczytaniu dokumentacji transportu w Loopie 0; kryterium: zgodność z Claude Code, Claude Desktop (`mcp-remote`) i Codex CLI w dniu wyboru.
8. **Dostęp kontenera Coolify do tailnetu** — potwierdzić w Loopie 0; fallback Cloudflare Tunnel + Access service token (wtedy ChatGPT również możliwy przez publiczny URL z Access — osobna decyzja).
9. **ChatGPT jako klient** — wymaga publicznego URL (łączniki); poza v1, wraca przy pkt 8.
10. **Czy portal Architekta ma kiedyś czytać mostek zamiast pushu agenta** — poza v1; agent i mostek dzielą kod (`db.ts`, `queries/columns.ts`), więc wspólny pakiet `@walldecor/subiekt-core` do rozważenia, gdy pojawi się trzeci konsument.
11. **Dane osobowe w odpowiedziach narzędzi** (nazwy, NIP, e-mail kontrahentów trafiają do modelu AI użytkownika) — użytkownik akceptuje dla własnych narzędzi (Claude Code/Desktop na jego koncie); dla tokena `walldecor-app` scope bez `contractors:read`. Potwierdzić przed Loopem 2.
