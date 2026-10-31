# Integracja Subiekt GT → Portal Architekta — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Przed zamknięciem każdego loopa wykonaj „Checklist audytu atrap” z końca dokumentu.

**Cel:** dokumenty z Subiekta GT (ZK, FS, KFS, FP) oznaczone architektem trafiają raz dziennie do portalu, tworzą i aktualizują pozycje projektów, a prowizje liczą się z faktur zamiast z ręcznego wpisywania.

**Architektura:** agent na PC z bazą Subiekta czyta MS SQL tylko do odczytu i wysyła paczkę dokumentów (JSON, HTTPS, token + HMAC) do nowego endpointu portalu. Portal zapisuje dokumenty w tabelach pośrednich, mapuje je na architekta i projekt, przelicza pozycje przez wspólną warstwę serwisową (tę samą, której używa panel admina), zapisuje zmiany ZK jako wpisy w logu aktywności i podpowiada statusy. Twenty CRM nie jest częścią tego planu (osobny projekt).

**Stack:** Next.js 16 App Router, TypeScript, `src/lib/db.ts` (`query`, `withTransaction`, SQLite dev / MySQL prod), migracje `migrations/0NN_*.sql` + `scripts/ensure-production-schema.mjs`, testy `node:test` w `tests/`, Node ≥ 22 (type stripping). Agent: Node/TypeScript + pakiet `mssql`, Harmonogram zadań Windows.

---

## 0. Zasady globalne planu

1. **Żaden widoczny element interaktywny nie może być atrapą.** Każdy przycisk, link, ikona działa albo nie istnieje. Nie renderować UI „na przyszłość”.
2. **Zakaz placeholderów danych.** Dane w panelu pochodzą z bazy, nie z plików demo. Akcja „przypisz”, „połącz”, „zastosuj status” zmienia stan w bazie, nie tylko pokazuje komunikat.
3. **Jedna logika prowizji.** Endpoint synchronizacji i panel admina wywołują te same funkcje serwisowe. Zakaz drugiej implementacji `INSERT INTO commissions` poza `src/lib/projectItems.ts` (wyjątek: istniejący import historyczny w `src/app/actions/import.ts`, który zostaje bez zmian).
4. **Subiekt jest źródłem pozycji z synchronizacji.** Pozycje `source = 'SUBIEKT'` nie dają się edytować ani usuwać ręcznie. Pozycje `source = 'MANUAL'` zachowują dotychczasowe zachowanie.
5. **Idempotencja.** Ten sam dokument wysłany N razy daje jeden rekord i jeden zestaw pozycji. Każda operacja zapisu dokumentu działa w `withTransaction`.
6. **Bramka loopa:** `npm test && npx tsc --noEmit && npm run build` zielone (tsc: dopuszczalne wyłącznie 14 istniejących błędów TS5097 w testach), walidator loopa wykonany z wynikiem, scenariusz ręczny z DoD przeklikany. Limit 5 iteracji naprawczych; po przekroczeniu zatrzymać się i opisać problem, nie oznaczać loopa jako ukończony.
7. **Dowód, nie deklaracja.** Raport loopa zawiera uruchomione komendy z wynikiem, odpowiedź `curl` z endpointu, rekordy z bazy (`sqlite3` lub zapytanie), zrzut ekranu panelu. Loop bez sekcji DOWÓD nie jest ukończony.
8. **Nic nie dotyka produkcji** do momentu loopa 7. Dev na SQLite (`DB_TYPE=sqlite`, `DB_PATH=dev.sqlite`).

---

## 1. Decyzje biznesowe (potwierdzone 2026-10-29)

| # | Decyzja | Skutek w implementacji |
|---|---------|------------------------|
| 1 | Do prowizji liczą się tylko FS i KFS. ZK i FP tworzą pozycje „oczekujące” i podpowiadają status, ale prowizja powstaje z faktury. Zapłacona proforma bez FS nie liczy się. | Pozycje projektu pochodzą z „dokumentu wiodącego” łańcucha: dopóki nie ma FS, z ZK (prowizja PENDING, czyli dotychczasowa semantyka portalu dla PRZYJĘTY). Gdy pojawi się pierwsza FS w łańcuchu, pozycje z ZK są usuwane, a pozycje z FS wstawiane. Różnica ZK − suma FS pokazywana informacyjnie jako „pozostało do zafakturowania”. |
| 2 | Usługa (montaż) w Subiekcie to przeważnie pozycja jednorazowa (bez karty towaru). | Pozycja z kartą towaru → `PRODUCT`; pozycja jednorazowa → `INSTALLATION`. Admin może przełączyć typ pojedynczej pozycji w portalu; ręczne przełączenie jest trwałe (nie nadpisuje go kolejna synchronizacja). |
| 3 | Jeden ZK = jeden projekt. Pierwszy ZK danego architekta tworzy projekt automatycznie. Kilka ZK dla jednego projektu → admin łączy projekty. FS bez ZK → skrzynka „nieprzypisane”, admin wskazuje projekt. | Funkcje: `findOrCreateProjectForDocument`, `mergeProjects`, `moveDocumentToProject`, skrzynka `unassigned`. |
| 4 | Agent wysyła wyłącznie dokumenty z polem „Architekt” oraz dokumenty wystawione z takich ZK (łańcuch powiązań). Standardowa sprzedaż nigdy nie opuszcza biura. | Filtrowanie po stronie agenta. Portal dodatkowo odrzuca dokument bez `architect_code` i bez `parent_external_id` (kod 422 na pozycji paczki, nie na całej paczce). |
| 5 | Dokumenty podpowiadają status projektu, nie zmieniają go. Admin klika „Zastosuj”. | `computeSuggestedStatus` + przycisk wywołujący istniejące `updateProjectStatus`. |
| 6 | Pozycje z Subiekta zablokowane do edycji ręcznej. Pozycje wpisane przed integracją zostają i są oznaczone jako ręczne. | Kolumna `project_items.source` z domyślną wartością `MANUAL` dla istniejących rekordów. |
| 7 | Każdy dzienny snapshot ZK różniący się od poprzedniego daje wpis w logu aktywności projektu, widoczny dla admina i architekta. | Tabela `subiekt_document_snapshots`, diff pozycji, `logActivity('SUBIEKT_ZK_CHANGED', ...)`. |
| 8 | Synchronizacja raz dziennie wieczorem, pełny odczyt dokumentów z ostatnich 18 miesięcy, porównanie po hashu. | Agent nie polega na znaczniku modyfikacji w bazie GT. |

Poza zakresem tego planu: zapis do Subiekta (wymaga Sfery), synchronizacja do Twenty CRM, automatyczna zmiana statusów, obsługa WZ jako dokumentu wiodącego (WZ jest tylko ogniwem łańcucha ZK → WZ → FS).

---

## 2. Kontrakt danych

### 2.1 Paczka od agenta → `POST /api/integrations/subiekt/sync`

Nagłówki:

```
Authorization: Bearer <SUBIEKT_SYNC_TOKEN>
X-Subiekt-Timestamp: <unix seconds>
X-Subiekt-Signature: <hex HMAC-SHA256(SUBIEKT_SYNC_SECRET, `${timestamp}.${rawBody}`)>
Content-Type: application/json
```

Treść (`src/lib/subiekt/types.ts`):

```ts
export type SubiektDocType = 'ZK' | 'FS' | 'KFS' | 'FP' | 'WZ';

export interface SubiektDocumentPayload {
    /** dok_Id z bazy GT — klucz idempotencji. */
    external_id: number;
    type: SubiektDocType;
    /** Numer pełny z GT, np. "FS 123/10/2026". Tylko do wyświetlania. */
    number: string;
    issued_at: string;            // 'YYYY-MM-DD'
    /** Kontrahent z dokumentu. */
    contractor_name: string;
    contractor_nip: string | null;
    /** Wartość pola własnego „Architekt” (lub znacznika z uwag). null dla dokumentów pochodnych w łańcuchu. */
    architect_code: string | null;
    /** dok_Id dokumentu, z którego ten powstał (FS z ZK, FS z WZ, WZ z ZK, KFS z FS). null dla ZK/FP. */
    parent_external_id: number | null;
    net_total: number;
    gross_total: number;
    is_paid: boolean;
    /** Treść pola „Uwagi” — do wykrycia znacznika #A-xxx gdy brak pola własnego. */
    remarks: string | null;
    positions: SubiektPositionPayload[];
}

export interface SubiektPositionPayload {
    /** ob_Id z bazy GT. */
    external_id: number;
    ordinal: number;
    /** tw_Id z karty towaru lub null dla pozycji jednorazowej. */
    product_id: number | null;
    name: string;
    quantity: number;
    unit: string;
    unit_price_net: number;
    net_total: number;
}

export interface SubiektSyncRequest {
    /** Identyfikator uruchomienia agenta (UUID). Ten sam dla wszystkich stron paczki. */
    run_id: string;
    agent_version: string;
    /** Numer strony i liczba stron — agent dzieli paczkę po 200 dokumentów. */
    page: number;
    pages: number;
    documents: SubiektDocumentPayload[];
}

export interface SubiektSyncResponse {
    run_id: string;
    accepted: number;
    unchanged: number;
    rejected: Array<{ external_id: number; reason: string }>;
    /** Dokumenty, które portal przyjął, ale nie umiał przypisać do projektu (trafiły do skrzynki). */
    unassigned: number;
}
```

Kody odpowiedzi: `200` paczka przetworzona (odrzucone dokumenty w `rejected`), `401` zły token lub podpis, `400` niepoprawny JSON lub koperta paczki (`run_id`, `page`, `pages`, `documents`), `413` ponad 200 dokumentów, `429` ponad 60 wywołań na 10 minut z jednego IP. **Walidacja dokumentów jest per dokument:** błędny dokument nie odrzuca strony, tylko trafia do `rejected` z powodem `VALIDATION:<ścieżka>: <komunikat>` (decyzja po przeglądzie jakości loopa 1, żeby jeden zły dokument nie blokował codziennej synchronizacji). Hash treści ma wersję (`HASH_VERSION`); podbicie wersji wymusza nowy snapshot każdego dokumentu.

### 2.2 Nowe tabele (migracja `migrations/019_subiekt_integration.sql`)

```sql
-- 019: Integracja Subiekt GT. Dokumenty z Subiekta oznaczone architektem trafiają do tabel
--      pośrednich, są mapowane na projekty i pozycje (source = 'SUBIEKT'), a zmiany ZK zapisują
--      się jako snapshoty. Zob. PLAN-SUBIEKT-2026-10-29.md.

ALTER TABLE users ADD COLUMN subiekt_code VARCHAR(64) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_subiekt_code ON users(subiekt_code);

ALTER TABLE project_items ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE project_items ADD COLUMN subiekt_document_id VARCHAR(36) NULL;
ALTER TABLE project_items ADD COLUMN subiekt_position_id INTEGER NULL;
ALTER TABLE project_items ADD COLUMN type_overridden INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_project_items_subiekt_doc ON project_items(subiekt_document_id);

CREATE TABLE IF NOT EXISTS subiekt_documents (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    external_id INTEGER NOT NULL UNIQUE,
    type VARCHAR(8) NOT NULL,
    number VARCHAR(64) NOT NULL,
    issued_at DATE NOT NULL,
    contractor_name VARCHAR(255) NOT NULL,
    contractor_nip VARCHAR(20) NULL,
    architect_code VARCHAR(64) NULL,
    architect_id VARCHAR(36) NULL,
    parent_external_id INTEGER NULL,
    root_external_id INTEGER NULL,
    project_id VARCHAR(36) NULL,
    net_total DECIMAL(12,2) NOT NULL,
    gross_total DECIMAL(12,2) NOT NULL,
    is_paid INTEGER NOT NULL DEFAULT 0,
    remarks TEXT NULL,
    content_hash CHAR(64) NOT NULL,
    positions_json TEXT NOT NULL,
    assignment_status VARCHAR(16) NOT NULL DEFAULT 'UNASSIGNED',
    assignment_note TEXT NULL,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_run_id VARCHAR(36) NULL
);
CREATE INDEX IF NOT EXISTS idx_subiekt_documents_project ON subiekt_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_subiekt_documents_root ON subiekt_documents(root_external_id);
CREATE INDEX IF NOT EXISTS idx_subiekt_documents_assignment ON subiekt_documents(assignment_status);

CREATE TABLE IF NOT EXISTS subiekt_document_snapshots (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL,
    run_id VARCHAR(36) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    positions_json TEXT NOT NULL,
    net_total DECIMAL(12,2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subiekt_snapshots_document ON subiekt_document_snapshots(document_id, created_at);

CREATE TABLE IF NOT EXISTS subiekt_sync_run_pages (
    run_id VARCHAR(36) NOT NULL,
    page INTEGER NOT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, page)
);

CREATE TABLE IF NOT EXISTS subiekt_sync_runs (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    agent_version VARCHAR(32) NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    pages_received INTEGER NOT NULL DEFAULT 0,
    pages_expected INTEGER NOT NULL DEFAULT 0,
    documents_accepted INTEGER NOT NULL DEFAULT 0,
    documents_unchanged INTEGER NOT NULL DEFAULT 0,
    documents_rejected INTEGER NOT NULL DEFAULT 0,
    documents_unassigned INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    error TEXT NULL
);
```

`assignment_status`: `UNASSIGNED` (czeka w skrzynce) | `AUTO` (przypisany przez regułę) | `MANUAL` (przypisany przez admina) | `IGNORED` (admin odrzucił, np. duplikat testowy).

Uwaga SQLite vs MySQL: `ALTER TABLE ... ADD COLUMN` z `UNIQUE` nie działa w SQLite, dlatego indeks unikalny jest osobną instrukcją. W `scripts/ensure-production-schema.mjs` dodać kolumny do `requiredColumns` i tabele do `requiredTables` tak samo jak dla `invitations`.

### 2.3 Zmienne środowiskowe

```
SUBIEKT_SYNC_TOKEN=<64 hex>      # Bearer; identyfikuje agenta
SUBIEKT_SYNC_SECRET=<64 hex>     # klucz HMAC podpisu treści
SUBIEKT_SYNC_MAX_SKEW_SECONDS=300
```

Brak którejkolwiek z pierwszych dwóch → endpoint zwraca `503 { error: "Integracja Subiekt nie jest skonfigurowana" }` i loguje ostrzeżenie przy starcie. Nigdy nie zapisywać tych wartości w repo. W Coolify ustawić jako sekrety.

### 2.4 Mapowanie dokumentu na architekta i projekt (`src/lib/subiekt/mapping.ts`)

Kolejność reguł dla każdego dokumentu w paczce (paczka jest sortowana: najpierw ZK i FP, potem WZ, potem FS, potem KFS, w obrębie typu po `issued_at`):

1. **Architekt.** `architect_code` z pola własnego. Jeśli `null`, spróbuj znacznika z `remarks` wyrażeniem `/#A[-_]?([A-Za-z0-9]{1,16})/`. Jeśli nadal `null` i jest `parent_external_id`, weź `architect_id` z dokumentu nadrzędnego (po `external_id`, może pochodzić z tej samej paczki lub z bazy). Jeśli po tym `architect_id` nadal `null` → dokument zapisany z `assignment_status = 'UNASSIGNED'`, powód `NO_ARCHITECT`.
2. **Kod → konto.** `SELECT id FROM users WHERE subiekt_code = ? AND role = 'ARCHI'`. Brak → `UNASSIGNED`, powód `UNKNOWN_ARCHITECT_CODE:<kod>`.
3. **Korzeń łańcucha.** `root_external_id` = idź po `parent_external_id` aż do dokumentu bez rodzica. Dla ZK i FP korzeń to on sam.
4. **Projekt.**
   - Dokument korzenia typu ZK lub FP: jeśli `subiekt_documents.project_id` już ustawione → zostaje. Jeśli nie → `findOrCreateProjectForDocument`: utwórz projekt `name = "<contractor_name> — <number>"`, `client_label = contractor_name`, `owner_id = architect_id`, `status = 'PRZYJĘTY'` (ZK oznacza, że WallDecor przyjął zamówienie), `assignment_status = 'AUTO'`.
   - Dokument pochodny (WZ, FS, KFS): `project_id` = `project_id` korzenia. Brak korzenia w bazie (FS bez ZK) → `UNASSIGNED`, powód `NO_ROOT_DOCUMENT`.
5. **Pozycje projektu.** Tylko dla dokumentów z `project_id` i typu ZK, FS, KFS (WZ i FP nigdy nie tworzą pozycji):
   - Wyznacz dokument wiodący łańcucha: jeśli w łańcuchu istnieje co najmniej jedna FS → wiodące są wszystkie FS (i KFS jako korekty), a pozycje z ZK tego łańcucha są usuwane (`deleteItemCore`, dozwolone bo projekt nie jest ZAKOŃCZONY; jeśli jest ZAKOŃCZONY → korekta do 0 przez `updateItemAmountCore`). Jeśli nie ma FS → wiodący jest ZK.
   - Dla dokumentu wiodącego: każda pozycja → `project_item` z `source = 'SUBIEKT'`, `subiekt_document_id`, `subiekt_position_id`, `type = product_id ? 'PRODUCT' : 'INSTALLATION'` (chyba że `type_overridden = 1`), `category = type === 'PRODUCT' ? 'Produkt (Subiekt)' : 'Montaż (Subiekt)'`, `description = name`, `amount_net = net_total`, `order_number = numer ZK korzenia`, `invoice_number = numer FS` (dla FS), `is_paid = is_paid` dokumentu.
   - Upsert pozycji po kluczu `(subiekt_document_id, subiekt_position_id)`: nowa → `addItemCore`; zmieniona kwota → `updateItemAmountCore`; brak w paczce → `deleteItemCore`.
   - **Dokumenty MANUAL:** admin decyduje o przypisaniu, Subiekt o treści — dla dokumentu `MANUAL` pomijane są kroki 1–4 (architekt, korzeń, projekt), ale pozycje są synchronizowane jak dla `AUTO`. `IGNORED` pomija wszystko.
   - **Niezgodność właściciela:** dokument pochodny, którego własny kod architekta wskazuje inne konto niż `owner_id` projektu korzenia → `UNASSIGNED`, powód `OWNER_MISMATCH:<kod>`, bez pozycji. Dokument już przypisany, który zaczął wskazywać innego architekta → zostaje w projekcie, dostaje `assignment_note = OWNER_MISMATCH:<kod>` i wpis `SUBIEKT_OWNER_MISMATCH` w logu aktywności.
   - **Korekty (KFS) są widokiem pochodnym:** mapa korekt projektu = wszystkie KFS `AUTO`/`MANUAL` projektu, po pozycji FS (`corrects_position_external_id`), ostatnia wygrywa (`issued_at`, potem `external_id`). Cele KFS są walidowane względem `positions_json` faktur projektu, nie względem `project_items` (pozycja skorygowana do zera nie istnieje już jako `project_item`). Synchronizacja pozycji FS zawsze nakłada tę mapę; po przetworzeniu KFS resynchronizowane są pozycje dotkniętych FS.
   - KFS: dla każdej pozycji korekty znajdź pozycję FS po `product_id` i `ordinal` (korekta w GT odwołuje się do pozycji korygowanej; agent wysyła w `positions` wartość **po korekcie** jako `net_total` oraz oryginalny `external_id` pozycji FS w polu `corrects_position_external_id`). Dopasowana → `updateItemAmountCore(item, nowa_kwota)`. Niedopasowana → dokument `UNASSIGNED`, powód `UNMATCHED_CORRECTION`, pozycje FS bez zmian.
6. **Status.** `computeSuggestedStatus(projectId)`: brak FS → `PRZYJĘTY`; jest FS niezapłacona → `W_REALIZACJI`; wszystkie FS zapłacone i `suma FS ≥ suma ZK` (lub brak ZK) → `ZAKOŃCZONY`. Wynik nie zapisuje się w `projects.status`; jest liczony przy renderze strony projektu i w skrzynce.

Rozszerzenie typu pozycji o `corrects_position_external_id: number | null` dodać do `SubiektPositionPayload`.

### 2.5 Diff ZK (`src/lib/subiekt/diff.ts`)

```ts
export interface PositionDiffLine {
    kind: 'ADDED' | 'REMOVED' | 'QUANTITY' | 'PRICE' | 'NAME';
    name: string;
    before: string | null;   // np. "10 szt × 120,00"
    after: string | null;
}

export function diffPositions(prev: SubiektPositionPayload[], next: SubiektPositionPayload[]): PositionDiffLine[]
export function formatDiffForLog(docNumber: string, lines: PositionDiffLine[], netBefore: number, netAfter: number): string
// → "ZK 45/10/2026: Tapeta Floral 10 → 8 szt; dodano Montaż 1 200,00 zł; wartość 14 300,00 → 13 160,00 zł"
```

Dopasowanie pozycji: po `external_id` (ob_Id); GT przy edycji ZK zachowuje ob_Id istniejących pozycji, nowe pozycje mają nowe ob_Id. **Klucz historii:** wpis `SUBIEKT_ZK_CHANGED` ma `activity_logs.subject_id = subiekt_documents.id` (migracja 020, indeks `(event_type, subject_id)`); widok „Zmiany zamówienia” pobiera wpisy po dokumentach projektu, więc historia podąża za dokumentem przy przypisaniu, łączeniu i przenoszeniu. Stan „przed” pochodzi z wiersza dokumentu sprzed aktualizacji (nie z poprzedniego snapshotu, bo znaczniki czasu mają rozdzielczość sekundy). Kwoty w logu z separatorem tysięcy U+00A0. Gdy `content_hash` dokumentu różni się od ostatniego snapshotu → zapisz snapshot, policz diff, `logActivity(null, 'SUBIEKT_ZK_CHANGED', sformatowany tekst, { projectId, documentId, lines })`. `user_id = null` oznacza „system”; panel pokazuje autora „Subiekt (synchronizacja)”.

---

## 3. Struktura plików

| Plik | Odpowiedzialność |
|------|------------------|
| `migrations/019_subiekt_integration.sql` | Schemat z 2.2 |
| `scripts/ensure-production-schema.mjs` | Dodanie kolumn i tabel dla MySQL na produkcji |
| `src/lib/projectItems.ts` | **Nowy.** Rdzeń pozycji i prowizji wyciągnięty z `src/app/actions/projects.ts`: `addItemCore`, `updateItemAmountCore`, `deleteItemCore`, `getArchitectCommissionRate`, `getProjectCommissionRate`. Przyjmuje `actorId: string | null` i `queryFn`. Bez `getServerSession`, bez `revalidatePath`. |
| `src/app/actions/projects.ts` | Server actions stają się cienkimi wrapperami: sesja + uprawnienia → wywołanie rdzenia → `revalidatePath`. Dodatkowo blokada edycji pozycji `source = 'SUBIEKT'`. |
| `src/lib/subiekt/types.ts` | Typy z 2.1 |
| `src/lib/subiekt/auth.ts` | `verifySubiektRequest(headers, rawBody, now)` → `{ ok: true } \| { ok: false, status: 401 \| 503, reason }` |
| `src/lib/subiekt/validate.ts` | `parseSyncRequest(json)` ręczna walidacja schematu (bez nowej zależności; w repo nie ma zod) |
| `src/lib/subiekt/hash.ts` | `hashDocument(doc)` SHA-256 z kanonicznej serializacji (posortowane klucze, pozycje po `external_id`) |
| `src/lib/subiekt/mapping.ts` | Reguły z 2.4 |
| `src/lib/subiekt/diff.ts` | Diff i format z 2.5 |
| `src/lib/subiekt/sync.ts` | `processSyncPage(request, runId)` orkiestracja: run → dokumenty → hash → snapshot → mapowanie → pozycje → odpowiedź |
| `src/lib/subiekt/status.ts` | `computeSuggestedStatus(projectId)` |
| `src/lib/subiekt/queries.ts` | Zapytania do widoków admina: skrzynka, dokumenty projektu, ostatnie uruchomienia |
| `src/app/api/integrations/subiekt/sync/route.ts` | `POST` — czyta surowe body, weryfikuje, parsuje, woła `processSyncPage` |
| `src/app/api/integrations/subiekt/status/route.ts` | `GET` — dla agenta: ostatnie uruchomienie, liczba nieprzypisanych (ten sam token) |
| `src/app/actions/subiekt.ts` | Server actions admina: `assignDocumentToProject`, `createProjectFromDocument`, `ignoreDocument`, `mergeProjects`, `moveDocumentToProject`, `overrideItemType`, `applySuggestedStatus`, `updateArchitectSubiektCode` |
| `src/app/dashboard/admin/integrations/subiekt/page.tsx` | Strona „Subiekt”: ostatnie uruchomienia, skrzynka nieprzypisanych, dokumenty bez kodu architekta |
| `src/app/dashboard/admin/integrations/subiekt/SubiektInboxClient.tsx` | Klient skrzynki: przypisz / utwórz projekt / ignoruj |
| `src/app/dashboard/admin/projects/[id]/page.tsx` | Sekcja „Dokumenty Subiekt” + sugerowany status + „pozostało do zafakturowania” |
| `src/components/ProjectDetailClient.tsx` | Blokada edycji pozycji SUBIEKT, przełącznik typu pozycji, przycisk „Zastosuj status”, „Połącz z projektem…”, „Przenieś dokument…” |
| `src/app/dashboard/admin/architects/[id]/...` | Pole „Kod w Subiekcie” w edycji architekta (istniejący `EditArchitectModal` / `updateArchitectAdminFields`) |
| `src/components/Sidebar.tsx` | Link „Subiekt” w nawigacji admina |
| `agent-subiekt/` | **Nowy katalog w repo.** Agent Node/TS: `src/config.ts`, `src/db.ts`, `src/queries.ts`, `src/chain.ts`, `src/payload.ts`, `src/send.ts`, `src/main.ts`, `README.md`, `install-task.ps1` |
| `tests/subiektAuth.test.ts`, `tests/subiektValidate.test.ts`, `tests/subiektHash.test.ts`, `tests/subiektMapping.test.ts`, `tests/subiektDiff.test.ts`, `tests/subiektSync.test.ts`, `tests/projectItemsCore.test.ts` | Testy `node:test` |

Testy integracyjne (`subiektSync`, `projectItemsCore`) uruchamiają się na tymczasowym pliku SQLite budowanym helperem `tests/helpers/sqliteTestDb.ts` (schemat z bloku SCHEMA-START/END w `scripts/seed-dev.mjs`); moduły `src/` ładowane przez `tests/helpers/srcResolveHooks.ts`; `process.env.DB_TYPE/DB_PATH` ustawiane przed dynamicznym importem `src/lib/db.ts`. Uruchomienie: `npm test` (Node 25 z brew, bo Node 26 nie ma prebuiltów `better-sqlite3`).

---

## 4. Loopy

### Loop 0 — Wydzielenie rdzenia pozycji i prowizji (refaktor bez zmiany zachowania)

**Pliki:** utwórz `src/lib/projectItems.ts`; zmodyfikuj `src/app/actions/projects.ts` (funkcje `addProjectItem` 874–950, `updateProjectItem` 726–873, `deleteProjectItem` 952–989, `getArchitectCommissionRate`, `getProjectCommissionRate`); testy `tests/projectItemsCore.test.ts`.

Sygnatury rdzenia:

```ts
export interface ItemActor { actorId: string | null; note?: string | null }

export interface NewItemInput {
    type: 'PRODUCT' | 'INSTALLATION';
    category: string;
    description?: string | null;
    amount_net: number;
    order_number?: string | null;
    invoice_number?: string | null;
    is_paid?: boolean;
    source?: 'MANUAL' | 'SUBIEKT';
    subiekt_document_id?: string | null;
    subiekt_position_id?: number | null;
}

export async function addItemCore(projectId: string, input: NewItemInput, actor: ItemActor): Promise<{ itemId: string }>
export async function updateItemAmountCore(itemId: string, amountNet: number, actor: ItemActor): Promise<{ projectId: string }>
export async function deleteItemCore(itemId: string, actor: ItemActor): Promise<{ projectId: string; status: string } | null>
```

Zasady przeniesienia: ciało funkcji przenieść 1:1, zamienić `session.user.id` na `actor.actorId`, `note` na `actor.note`, usunąć `revalidatePath` (zostaje w akcji). `logActivity` zostaje w rdzeniu (loguje `actorId`, może być `null`). `INSERT INTO project_items` rozszerzyć o kolumny `source, subiekt_document_id, subiekt_position_id`. Każdy rdzeń jest atomowy (`withTransaction`).

**Transakcje re-entrantne (decyzja po przeglądzie jakości loopa 0):** `src/lib/db.ts` trzyma kontekst transakcji w `AsyncLocalStorage`. Zagnieżdżony `withTransaction` dołącza do trwającej transakcji (zewnętrzna decyduje o commit/rollback), a `query` wewnątrz transakcji MySQL sam trafia na jej połączenie. Dzięki temu rdzeń nie przyjmuje `queryFn`, a `processSyncPage` w loopie 2 woła rdzenie z własnej transakcji bez żadnych flag. `logActivity` dołącza do transakcji na obu silnikach.

- [ ] Krok 1: napisać `tests/projectItemsCore.test.ts` z testami na tymczasowej bazie SQLite:
  - `addItemCore` na projekcie PRZYJĘTY tworzy pozycję i prowizję PENDING ze stawką architekta;
  - `addItemCore` na projekcie ZAKOŃCZONY tworzy prowizję EARNED i cashback EARN z `expires_at` za 12 miesięcy;
  - `updateItemAmountCore` na ZAKOŃCZONY z 10 000 → 8 000 tworzy korektę prowizji i cashbacku (ujemne kwoty), suma prowizji projektu = 8 000 × stawka;
  - `deleteItemCore` na PRZYJĘTY usuwa pozycję i PENDING;
  - `addItemCore` z `source: 'SUBIEKT'` zapisuje `source`, `subiekt_document_id`, `subiekt_position_id`.
- [ ] Krok 2: uruchomić — oczekiwane FAIL („module not found”).
- [ ] Krok 3: utworzyć `src/lib/projectItems.ts`, przenieść logikę, przepisać akcje na wrappery.
- [ ] Krok 4: `node --test tests/*.test.ts` — wszystkie dotychczasowe testy (52) i nowe zielone. `tests/commissionConsistency.test.ts` i `tests/commissionCorrections.test.ts` czytają źródło `actions/projects.ts` wyrażeniami regularnymi — jeśli po przeniesieniu wskazują zły plik, zaktualizować je tak, by czytały `src/lib/projectItems.ts`, bez osłabiania asercji.
- [ ] Krok 5: ręcznie w panelu admina: dodać pozycję, zmienić kwotę, usunąć pozycję na projekcie PRZYJĘTY i ZAKOŃCZONY. Zachowanie identyczne jak przed refaktorem (porównać z PROGRESS.md, Faza 4).
- [ ] Krok 6: commit `refactor: extract project item core into src/lib/projectItems.ts`.

**DoD:** admin dodaje pozycję 5 000 PLN do projektu PRZYJĘTY; w tabeli `commissions` pojawia się PENDING = 5 000 × stawka; po zmianie na 4 000 kwota PENDING się aktualizuje; po usunięciu PENDING znika. Na projekcie ZAKOŃCZONY korekta 10 000 → 8 000 daje wpis korygujący prowizję i cashback o −2 000 × stawka. Wszystko bez dotykania bazy ręcznie.

**Walidator:** `node --test tests/projectItemsCore.test.ts` zielony; `INSERT INTO commissions` w `src/app/actions/projects.ts` występuje wyłącznie wewnątrz `updateProjectStatus` (finalizacja projektu zostaje w akcji; sync korzysta z niej przez `applySuggestedStatus`, więc nie wymaga przeniesienia).

---

### Loop 1 — Uwierzytelnienie maszynowe, tabele pośrednie, endpoint przyjmujący paczkę

**Pliki:** `migrations/019_subiekt_integration.sql`, `scripts/ensure-production-schema.mjs`, `scripts/seed-dev.mjs` (dodać nowe tabele i kolumny do schematu dev), `src/lib/subiekt/{types,auth,validate,hash,sync}.ts`, `src/app/api/integrations/subiekt/sync/route.ts`, `src/app/api/integrations/subiekt/status/route.ts`, `tests/subiektAuth.test.ts`, `tests/subiektValidate.test.ts`, `tests/subiektHash.test.ts`, `tests/subiektSync.test.ts`.

Zagnieżdżone transakcje są już obsłużone w loopie 0 (`AsyncLocalStorage` w `src/lib/db.ts`); `processSyncPage` woła rdzenie bez flag, jedna transakcja na dokument (zob. 2.1). Drobne uzupełnienia `db.ts` w tym loopie: komentarz dokumentujący zasadę „błąd wewnętrzny musi propagować do granicy transakcji (brak savepointów)”; zwolnienie połączenia MySQL także gdy `beginTransaction` rzuci; `console.warn` gdy `query` zostanie wywołane po zakończeniu transakcji (kontekst `active = false`), bo oznacza to zagubiony callback. Trasa MySQL w `query` nie ma testu automatycznego (testy działają na SQLite); weryfikacja ręczna na produkcyjnej bazie w loopie 7.

W tym loopie `processSyncPage` zapisuje dokumenty, snapshoty i run, ale **nie** mapuje na projekty (każdy dokument `UNASSIGNED`, powód `MAPPING_NOT_ENABLED`). Mapowanie wchodzi w loopie 2.

`src/lib/subiekt/auth.ts`:

```ts
import crypto from 'crypto';

export type AuthResult = { ok: true } | { ok: false; status: 401 | 503; reason: string };

export function verifySubiektRequest(
    headers: { authorization?: string | null; timestamp?: string | null; signature?: string | null },
    rawBody: string,
    nowSeconds: number,
    env: { token?: string; secret?: string; maxSkewSeconds?: number } = {
        token: process.env.SUBIEKT_SYNC_TOKEN,
        secret: process.env.SUBIEKT_SYNC_SECRET,
        maxSkewSeconds: (() => { const n = Number(process.env.SUBIEKT_SYNC_MAX_SKEW_SECONDS); return Number.isFinite(n) && n > 0 ? n : 300; })(),
    }
): AuthResult {
    if (!env.token || !env.secret) return { ok: false, status: 503, reason: 'NOT_CONFIGURED' };

    const bearer = (headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(bearer, env.token)) return { ok: false, status: 401, reason: 'BAD_TOKEN' };

    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts)) return { ok: false, status: 401, reason: 'BAD_TIMESTAMP' };
    if (Math.abs(nowSeconds - ts) > (env.maxSkewSeconds ?? 300)) return { ok: false, status: 401, reason: 'STALE_TIMESTAMP' };

    const expected = crypto.createHmac('sha256', env.secret).update(`${ts}.${rawBody}`).digest('hex');
    if (!safeEqual(headers.signature || '', expected)) return { ok: false, status: 401, reason: 'BAD_SIGNATURE' };

    return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}
```

Route handler czyta `await req.text()` (surowe body, nie `req.json()`), bo podpis liczy się z bajtów. Rate limit: `createRateLimiter({ max: 60, windowMs: 10 * 60 * 1000 })` z `src/lib/rateLimit.ts`, klucz = IP z `x-forwarded-for`.

`processSyncPage` (szkic przebiegu). **Granica transakcji = jeden dokument**, nie cała strona: zagnieżdżony `withTransaction` dołącza do zewnętrznej transakcji bez savepointu, więc błąd wewnętrznego wywołania musi propagować do granicy transakcji. Każdy dokument jest przetwarzany w osobnym `withTransaction`; wyjątek w jego obrębie wycofuje tylko ten dokument, trafia do `rejected` z powodem `INTERNAL_ERROR:<komunikat>` i jest logowany, a przetwarzanie reszty paczki trwa. Aktualizacja `subiekt_sync_runs` odbywa się poza transakcjami dokumentów.

1. `INSERT` lub `UPDATE subiekt_sync_runs` po `run_id` (`pages_expected = pages`). Strona jest rejestrowana w `subiekt_sync_run_pages (run_id, page)`; ponowna wysyłka tej samej strony (retry agenta po timeoucie) nie zwiększa `pages_received` — dokumenty są przetwarzane ponownie idempotentnie, a `pages_received = COUNT(*)` z tej tabeli dla runu.
2. Dla każdego dokumentu: `content_hash = hashDocument(doc)`; `SELECT id, content_hash FROM subiekt_documents WHERE external_id = ?`.
   - brak → `INSERT` dokumentu + `INSERT` snapshotu; `accepted++`.
   - jest, hash równy → `UPDATE last_seen_at, last_run_id, is_paid` (zapłata nie wchodzi do hasha, bo nie jest zmianą treści, ale ma się aktualizować); `unchanged++`.
   - jest, hash różny → `UPDATE` wszystkich pól treści + `last_changed_at` + `INSERT` snapshotu; `accepted++`.
3. Gdy `pages_received >= pages_expected` → `status = 'DONE'`, `finished_at = NOW()`. `processSyncPage` musi być wywoływane poza transakcją (route tak robi); wywołanie wewnątrz cudzej transakcji znosi izolację per dokument.
4. Zwrócić `SubiektSyncResponse`.

- [ ] Krok 1: migracja 019 (plik już istnieje po loopie 0 z trzema `ALTER TABLE project_items`; dopisać resztę schematu z 2.2) + aktualizacja `seed-dev.mjs` i `ensure-production-schema.mjs`. Uruchomić migrację na `dev.sqlite` (`sqlite3 dev.sqlite < migrations/019_subiekt_integration.sql`), sprawdzić `.schema subiekt_documents`.
- [ ] Krok 2: testy `subiektAuth` (brak env → 503; zły token → 401 BAD_TOKEN; timestamp sprzed 10 min → STALE_TIMESTAMP; zły podpis → BAD_SIGNATURE; poprawne → ok; podpis policzony z body z dodatkową spacją → BAD_SIGNATURE).
- [ ] Krok 3: testy `subiektValidate` (brak `documents` → błąd; `external_id` jako string → błąd; `type: 'XX'` → błąd; 201 dokumentów → błąd `TOO_MANY`; poprawna paczka → obiekt z typami).
- [ ] Krok 4: testy `subiektHash` (zmiana kolejności pozycji nie zmienia hasha; zmiana `quantity` zmienia; zmiana `is_paid` nie zmienia; zmiana `remarks` zmienia).
- [ ] Krok 5: testy `subiektSync` na tymczasowej bazie: paczka 3 dokumentów → 3 wiersze, 3 snapshoty, run DONE; ta sama paczka drugi raz → `unchanged = 3`, nadal 3 snapshoty; paczka ze zmienioną ilością w jednym → `accepted = 1`, 4 snapshoty, `last_changed_at` zaktualizowane; paczka 2-stronicowa → run DONE dopiero po drugiej stronie.
- [ ] Krok 6: implementacja plików z 3., aż testy przejdą.
- [ ] Krok 7: walidator ręczny:

```bash
BODY='{"run_id":"11111111-1111-1111-1111-111111111111","agent_version":"0.1.0","page":1,"pages":1,"documents":[{"external_id":5001,"type":"ZK","number":"ZK 1/10/2026","issued_at":"2026-10-20","contractor_name":"Jan Testowy","contractor_nip":null,"architect_code":"A-001","parent_external_id":null,"net_total":1000,"gross_total":1230,"is_paid":false,"remarks":null,"positions":[{"external_id":9001,"ordinal":1,"product_id":77,"name":"Tapeta Test","quantity":10,"unit":"szt","unit_price_net":100,"net_total":1000,"corrects_position_external_id":null}]}]}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SUBIEKT_SYNC_SECRET" | awk '{print $2}')
curl -s -w '\n%{http_code}\n' -X POST http://localhost:3000/api/integrations/subiekt/sync \
  -H "Authorization: Bearer $SUBIEKT_SYNC_TOKEN" -H "X-Subiekt-Timestamp: $TS" -H "X-Subiekt-Signature: $SIG" \
  -H 'Content-Type: application/json' --data-binary "$BODY"
```

Oczekiwane: `{"run_id":"1111…","accepted":1,"unchanged":0,"rejected":[],"unassigned":1}` i `200`. Drugie wywołanie z nowym `TS`/`SIG`: `unchanged: 1`. Wywołanie ze złym tokenem: `401`. `sqlite3 dev.sqlite "SELECT external_id, type, assignment_status FROM subiekt_documents"` zwraca jeden wiersz `5001|ZK|UNASSIGNED`. Po restarcie `npm run dev` wiersz nadal jest.

- [ ] Krok 8: commit `feat(subiekt): machine auth, staging tables and sync endpoint`.

**DoD:** agent (symulowany przez `curl`) wysyła paczkę z poprawnym tokenem i podpisem; dokumenty lądują w `subiekt_documents` z snapshotem; ponowna wysyłka nie tworzy duplikatów; zły token, stary timestamp i zły podpis dają 401; brak konfiguracji daje 503; dane przeżywają restart aplikacji.

---

### Loop 2 — Mapowanie na architekta, projekt i pozycje (serce integracji)

**Pliki:** `src/lib/subiekt/mapping.ts`, `src/lib/subiekt/sync.ts` (włączenie mapowania), `src/lib/subiekt/status.ts`, `src/app/actions/architects.ts` (pole `subiekt_code` w `updateArchitectAdminFields`), `src/components/EditArchitectModal.tsx` (input „Kod w Subiekcie”), `tests/subiektMapping.test.ts`, rozszerzenie `tests/subiektSync.test.ts`.

- [ ] Krok 1: testy `subiektMapping` (czyste funkcje bez bazy): `resolveArchitectCode` z pola własnego; z uwag `"Projekt salon #A-001 pilne"` → `A-001`; brak → null. `sortDocumentsForProcessing` daje kolejność ZK/FP → WZ → FS → KFS. `resolveRoot` dla łańcucha ZK(1) → WZ(2, parent 1) → FS(3, parent 2) zwraca 1 dla każdego. `positionToItem` dla `product_id: null` daje `INSTALLATION`.
- [ ] Krok 2: testy integracyjne w `subiektSync` (baza tymczasowa z architektem `subiekt_code = 'A-001'` i drugim bez kodu):
  - ZK z `A-001` → projekt utworzony: `owner_id` = architekt, `status = 'PRZYJĘTY'`, `client_label = contractor_name`; 1 pozycja `PRODUCT` `source = 'SUBIEKT'`; prowizja PENDING;
  - ten sam ZK po edycji (ilość 10 → 8) → ta sama pozycja z nową kwotą, PENDING przeliczona, nadal 1 pozycja;
  - ZK z dwiema pozycjami, druga jednorazowa → 1 × PRODUCT, 1 × INSTALLATION;
  - FS z `parent_external_id` = ZK → pozycje ZK usunięte, pozycje FS wstawione z `invoice_number`, `order_number` = numer ZK; suma pozycji projektu = suma FS;
  - FS bez rodzica i bez kodu → `UNASSIGNED`, powód `NO_ARCHITECT`, zero pozycji;
  - FS z kodem `Z-999` nieznanym → `UNASSIGNED`, powód `UNKNOWN_ARCHITECT_CODE:Z-999`;
  - KFS korygująca pozycję FS 1 000 → 800 → kwota pozycji 800; na projekcie ZAKOŃCZONY powstaje korekta prowizji;
  - KFS do nieistniejącej pozycji → `UNASSIGNED`, powód `UNMATCHED_CORRECTION`, pozycje FS bez zmian;
  - `computeSuggestedStatus`: tylko ZK → `PRZYJĘTY`; FS niezapłacona → `W_REALIZACJI`; FS zapłacona i suma FS ≥ ZK → `ZAKOŃCZONY`;
  - pozycja z `type_overridden = 1` ustawiona ręcznie na `PRODUCT` nie zmienia typu po kolejnej synchronizacji.
- [ ] Krok 3: implementacja `mapping.ts`, `status.ts`, włączenie w `sync.ts` (w tej samej transakcji co zapis dokumentu).
- [ ] Krok 4: pole „Kod w Subiekcie” w edycji architekta (modal + server action + walidacja: 1–64 znaki, unikalne, komunikat „Ten kod ma już inny architekt”).
- [ ] Krok 5: walidator `curl` jak w loopie 1, ale z architektem posiadającym kod `A-001` w bazie dev: odpowiedź `unassigned: 0`; `sqlite3 dev.sqlite "SELECT name, status, owner_id FROM projects ORDER BY created_at DESC LIMIT 1"` pokazuje nowy projekt; `SELECT type, amount_net, source FROM project_items WHERE source='SUBIEKT'` pokazuje pozycję; w panelu admina projekt jest widoczny z pozycją i prowizją PENDING; architekt po zalogowaniu widzi projekt na swojej liście.
- [ ] Krok 6: commit `feat(subiekt): map documents to architects, projects and items`.

**DoD:** admin nadaje architektowi kod `A-001`; `curl` z ZK dla `A-001` tworzy projekt, który admin widzi w pipeline, a architekt na swojej liście z kwotą netto i prowizją „w toku”; `curl` z FS do tego ZK zamienia pozycje na fakturowe i prowizja pozostaje spójna; `curl` z FS bez kodu nie tworzy projektu i zwiększa `unassigned`.

**Walidator antyatrap:** `grep -rn "INSERT INTO commissions" src/lib/subiekt/` zwraca `0` wyników (prowizje tylko przez `projectItems.ts`).

---

### Loop 3 — Snapshoty ZK, log zmian, blokada edycji ręcznej

**Pliki:** `src/lib/subiekt/diff.ts`, `src/lib/subiekt/sync.ts` (wywołanie diffu przy zmianie hasha dokumentu ZK), `src/app/actions/projects.ts` (odrzucenie `updateProjectItem`/`deleteProjectItem` dla `source = 'SUBIEKT'`), `src/components/ProjectDetailClient.tsx` (ukrycie ołówka i kosza dla pozycji SUBIEKT, badge „Subiekt”), widok logu aktywności w projekcie (admin: istniejący Activity Feed; architekt: `src/app/dashboard/projects/[id]` lub odpowiednik — sprawdzić w `ProjectDetailClient.tsx`, gdzie renderowany jest log), `tests/subiektDiff.test.ts`.

- [ ] Krok 1: testy `subiektDiff`: zmiana ilości → `QUANTITY` z `before "10 szt × 120,00"` i `after "8 szt × 120,00"`; nowa pozycja → `ADDED`; brak pozycji → `REMOVED`; zmiana ceny → `PRICE`; `formatDiffForLog` daje dokładnie `"ZK 45/10/2026: Tapeta Floral 10 → 8 szt; dodano Montaż 1 200,00 zł; wartość 14 300,00 → 13 160,00 zł"` (formatowanie PLN jak w `src/lib/utils.ts`).
- [ ] Krok 2: test w `subiektSync`: drugi sync ZK ze zmienioną ilością tworzy wpis `activity_logs` o `event_type = 'SUBIEKT_ZK_CHANGED'` z `metadata.projectId`; trzeci sync bez zmian nie tworzy wpisu.
- [ ] Krok 3: test (źródłowy, w stylu `importHistorical.test.ts`): `updateProjectItem` i `deleteProjectItem` w `actions/projects.ts` zawierają sprawdzenie `source === 'SUBIEKT'` i rzucają błąd `"Pozycja pochodzi z Subiekta i nie podlega edycji ręcznej."`.
- [ ] Krok 4: implementacja.
- [ ] Krok 5: ręcznie: po dwóch `curl` z różnymi ilościami wpis zmiany jest widoczny w Activity Feed admina i w szczegółach projektu u architekta; na pozycji SUBIEKT nie ma ołówka ani kosza, jest badge „Subiekt · ZK 1/10/2026”; próba wywołania `updateProjectItem` na takiej pozycji z konsoli przeglądarki zwraca błąd.
- [ ] Krok 6: commit `feat(subiekt): ZK change log and manual-edit lock for synced items`.

**DoD:** architekt loguje się, otwiera projekt i widzi wpis „Subiekt (synchronizacja): ZK 1/10/2026: Tapeta Test 10 → 8 szt; wartość 1 000,00 → 800,00 zł” z datą; admin widzi to samo w feedzie; admin nie może zmienić kwoty pozycji z Subiekta ani z UI, ani przez bezpośrednie wywołanie akcji.

---

### Loop 4 — Panel admina: skrzynka, przypisywanie, łączenie projektów, status, typ pozycji

**Pliki:** `src/lib/subiekt/queries.ts`, `src/app/actions/subiekt.ts`, `src/app/dashboard/admin/integrations/subiekt/page.tsx`, `SubiektInboxClient.tsx`, `src/app/dashboard/admin/projects/[id]/page.tsx`, `src/components/ProjectDetailClient.tsx`, `src/components/Sidebar.tsx`, testy źródłowe `tests/subiektAdminGuards.test.ts`.

Server actions (wszystkie: sesja ADMIN lub STAFF przez `canManageOperationalProjects`; `mergeProjects` i `moveDocumentToProject` tylko ADMIN przez `canManageFinancialOperations`, bo przeliczają prowizje):

```ts
export async function assignDocumentToProject(documentId: string, projectId: string): Promise<{ success: true }>
// ustawia subiekt_documents.project_id + assignment_status = 'MANUAL', uruchamia mapowanie pozycji dla łańcucha (ta sama funkcja co w sync), logActivity 'SUBIEKT_DOC_ASSIGNED'

export async function createProjectFromDocument(documentId: string, ownerId: string): Promise<{ success: true; projectId: string }>
// dla dokumentu UNASSIGNED z powodem NO_ROOT_DOCUMENT / NO_ARCHITECT: tworzy projekt jak findOrCreateProjectForDocument, ale z ownerId od admina; dokument staje się korzeniem (root_external_id = external_id)

export async function ignoreDocument(documentId: string, note: string): Promise<{ success: true }>
// assignment_status = 'IGNORED', assignment_note = note; znika ze skrzynki; kolejna synchronizacja nie przywraca

export async function mergeProjects(targetProjectId: string, sourceProjectIds: string[]): Promise<{ success: true }>
// wymagania: wszystkie projekty tego samego owner_id, żaden nie jest ZAKOŃCZONY ani NIEZREALIZOWANY (inaczej błąd z komunikatem);
// w withTransaction: UPDATE subiekt_documents SET project_id = target; UPDATE project_items SET project_id = target; UPDATE commissions SET project_id = target;
// UPDATE project_files SET project_id = target; activity_logs bez zmian (historia ZK kluczowana po subject_id dokumentu, więc sama podąża za dokumentami); DELETE FROM projects WHERE id IN (source);
// logActivity 'PROJECTS_MERGED' z listą nazw; nazwa projektu docelowego bez zmian

export async function moveDocumentToProject(documentId: string, targetProjectId: string): Promise<{ success: true }>
// tylko dla korzenia łańcucha (ZK/FP); przenosi cały łańcuch (root_external_id) i jego pozycje; wymaga tego samego owner_id; przelicza pozycje przez deleteItemCore/addItemCore w transakcji.
// WYMAGANIA Z PRZEGLĄDU LOOPA 2 (mappingDb.ts): (a) `loadItemsOfDocument` musi filtrować także po project_id (dziś szuka tylko po dokumencie, więc po zmianie project_id łańcucha `syncChainItems` zostawia pozycje w starym projekcie);
// (b) nowa funkcja `clearChainItems(rootExternalId, oldProjectId)`: usuwa pozycje łańcucha ze starego projektu przez deleteItemCore (na ZAKOŃCZONY → korekta do 0) i odpina wyzerowane wiersze (`subiekt_document_id = NULL`), dopiero potem `syncChainItems` w nowym projekcie;
// (c) KFS, która po zmianie przestaje pasować (AUTO → UNMATCHED_CORRECTION), powinna wywołać resync faktur, które wcześniej korygowała (dziś ich pozycje trzymają starą skorygowaną kwotę do następnej zmiany FS).

export async function overrideItemType(itemId: string, type: 'PRODUCT' | 'INSTALLATION'): Promise<{ success: true }>
// tylko source = 'SUBIEKT'; ustawia type i type_overridden = 1; jeśli projekt PRZYJĘTY/W_REALIZACJI: usuwa i zakłada PENDING zgodnie z typem (INSTALLATION bez prowizji); jeśli ZAKOŃCZONY: korekta przez updateItemAmountCore(0) + addItemCore z nowym typem

export async function applySuggestedStatus(projectId: string): Promise<{ success: true }>
// liczy computeSuggestedStatus i woła istniejące updateProjectStatus (z walidacją przejść); jeśli przejście niedozwolone (np. PRZYJĘTY → ZAKOŃCZONY) wykonuje kroki pośrednie w kolejności PRZYJĘTY → W_REALIZACJI → ZAKOŃCZONY
```

**Uwaga (Loop 4A, typ pozycji):** ręcznie zmieniony typ (`type_overridden = 1`) przechodzi z pozycją przy przeniesieniu / przypisaniu łańcucha (pozycja zakładana w nowym projekcie z tym samym typem przed odtworzeniem reszty). Nie przechodzi, gdy pozycje ZK zastępują pozycje FS (pierwsza faktura w łańcuchu) — to inne pozycje (`subiekt_position_id`), więc admin ustawia typ ponownie na pozycji FS.

Strona `/dashboard/admin/integrations/subiekt`:

- **Ostatnie uruchomienia** (10): data, wersja agenta, przyjęte / bez zmian / odrzucone / nieprzypisane, status, błąd. Brak uruchomień → tekst „Agent jeszcze nie wysłał żadnej paczki” i instrukcja konfiguracji (link do README agenta).
- **Skrzynka nieprzypisanych**: dokument (typ, numer, data, kontrahent, kwota), powód (`NO_ARCHITECT`, `UNKNOWN_ARCHITECT_CODE:…`, `NO_ROOT_DOCUMENT`, `UNMATCHED_CORRECTION`), akcje: „Przypisz do projektu…” (lista projektów; gdy znany architekt, filtrowana do jego projektów), „Utwórz projekt” (wybór architekta gdy brak), „Ignoruj” (pole notatki). Wszystkie z inline confirmation jak w `AdminPayoutsQueue` (phase idle → confirming → executing).
- **Nieznane kody architektów**: lista kodów z liczbą dokumentów i link „Nadaj kod architektowi” → edycja architekta.

Strona projektu (`/dashboard/admin/projects/[id]`):

- Sekcja „Dokumenty Subiekt”: tabela łańcuchów: ZK → FS/KFS z numerami, datami, kwotami, zapłacono. Linia „Pozostało do zafakturowania: X zł” gdy ZK > suma FS.
- Baner „Sugerowany status: W_REALIZACJI” z przyciskiem „Zastosuj” gdy sugestia ≠ aktualny status; brak banera gdy równe.
- Przycisk „Połącz z projektem…” (lista projektów tego samego architekta, multiselect, podsumowanie kwot, confirm).
- Przy każdym ZK: „Przenieś do innego projektu…”.
- Przy pozycji SUBIEKT: przełącznik typu Produkt / Montaż (confirm, komunikat o wpływie na prowizję).

Sidebar admina: link „Subiekt” z licznikiem nieprzypisanych (badge znika gdy 0).

- [ ] Krok 1: testy źródłowe `subiektAdminGuards`: każda akcja w `actions/subiekt.ts` zawiera `getServerSession` i sprawdzenie roli; `mergeProjects` zawiera `withTransaction` i `DELETE FROM projects`; `overrideItemType` nie zawiera `INSERT INTO commissions`.
- [ ] Krok 2: testy integracyjne w `subiektSync`: `mergeProjects` dwóch projektów z pozycjami → jeden projekt, suma pozycji zachowana, suma PENDING zachowana, dokumenty wskazują na docelowy; `mergeProjects` z projektem ZAKOŃCZONY → błąd; `moveDocumentToProject` przenosi łańcuch ZK+FS; `ignoreDocument` → kolejny sync tego dokumentu nie zmienia `assignment_status`; `overrideItemType` INSTALLATION → PRODUCT na PRZYJĘTY tworzy PENDING.
- [ ] Krok 3: implementacja akcji, zapytań, stron, komponentów.
- [ ] Krok 4: ręcznie, na bazie dev z co najmniej: 1 ZK przypisanym, 1 FS bez rodzica, 1 FS z nieznanym kodem, 2 projektami tego samego architekta:
  - skrzynka pokazuje 2 dokumenty z powodami; „Przypisz” FS do projektu → znika ze skrzynki, pozycje pojawiają się w projekcie, PENDING przeliczona;
  - „Nadaj kod” → po zapisaniu kodu i ponownym `curl` dokument sam się przypisuje;
  - „Połącz” 2 projekty → jeden projekt, drugi znika z pipeline, kwoty i prowizje się sumują, wpis w feedzie;
  - „Zastosuj” sugerowany status → status się zmienia, baner znika;
  - przełącznik typu → prowizja PENDING pojawia się / znika;
  - badge w sidebarze pokazuje liczbę i znika po opróżnieniu skrzynki.
- [ ] Krok 5: commit `feat(subiekt): admin inbox, project merge, status suggestions, item type override`.

**DoD:** admin bez dotykania bazy obsługuje każdy przypadek ze skrzynki (przypisz, utwórz, ignoruj, nadaj kod), łączy dwa projekty i przenosi ZK między projektami, a sumy pozycji i prowizji przed i po operacji są równe (sprawdzone zapytaniem). Każdy widoczny przycisk działa; żaden element nie jest renderowany „na przyszłość”.

---

### Loop 4b — Tryb wewnętrzny, kody architektów, ważność cashbacku (dodany 2026-10-30)

**Kontekst decyzji.** Pola własne w Subiekcie GT wymagają rozszerzenia PLUS (ok. 2000 zł/rok), więc znacznik architekta idzie do pola „Uwagi” ZK jako `#A-001` (kopiuje się na FS), a kategoria dokumentu `ARCHI` służy jako flaga „zlecenie z udziałem architekta”. Handlowiec szuka kodu architekta w portalu. Portal rusza najpierw **wewnętrznie** (admin/STAFF), architekci dostają dostęp później, gdy sumy zgodzą się z Subiektem.

**Zakres (wszystkie punkty obowiązkowe):**

1. **Kod na liście architektów i w wyszukiwarce.** `src/app/dashboard/admin/architects/page.tsx`: kolumna „Kod” z `u.subiekt_code` (puste → „—”), a filtr `q` szuka także po `u.subiekt_code LIKE ?`. Wpisanie `A-00` w szukajce zawęża listę do architektów z takim kodem.
2. **Automatyczne nadawanie kodu.** Nowa funkcja `nextSubiektCode()` w `src/lib/subiekt/codes.ts`: w transakcji odczytuje największy numer z kodów pasujących do `^A-(\d+)$` w `users` i zwraca kolejny, format `A-` + numer dopełniony zerami do 3 cyfr (`A-001` … `A-999`, dalej `A-1000`). Wywoływana przy KAŻDYM tworzeniu użytkownika ARCHI: `src/app/actions/import.ts` (import CSV), `src/app/api/auth/accept-invitation/route.ts` (zaproszenie), `src/app/actions/projects.ts` (tworzenie architekta przy projekcie, ok. linii 378). Ręcznie wpisany kod w modalu edycji nadal wygrywa (istniejąca logika `updateArchitect` bez zmian). Istniejące konta bez kodu: akcja serwerowa `assignMissingSubiektCodes()` (ADMIN) + przycisk „Nadaj brakujące kody” na liście architektów, widoczny tylko gdy są konta bez kodu; po kliknięciu lista pokazuje kody, wpis `SUBIEKT_CODES_ASSIGNED` w `activity_logs` z liczbą nadanych. Kolejność nadawania: po `created_at`, potem `name`.
3. **Przełącznik trybu wewnętrznego** `PORTAL_INTERNAL_MODE=1` (zmienna środowiskowa; helper `isInternalMode()` w `src/lib/internalMode.ts`, akceptuje `1`/`true`). Skutki, gdy włączony:
   - `src/lib/email.ts` `sendEmail`: wysyła tylko do adresów, które należą do użytkownika z rolą ADMIN lub STAFF (sprawdzenie `SELECT role FROM users WHERE email = ?`). Każdy inny adres (ARCHI lub nieistniejący, np. zaproszenie) → brak wysyłki, `console.info('[internal-mode] pominięto mail <slug> do <email>')`, zwrot `{ success: false, skipped: 'INTERNAL_MODE' }`. Wywołania `sendEmail` traktują to jak dotąd (nie rzucają).
   - `src/app/api/auth/forgot-password/route.ts`: dla użytkownika z rolą ARCHI odpowiedź identyczna jak dla nieistniejącego adresu (ta sama treść i status, bez tokenu, bez maila), żeby nie zdradzać istnienia konta.
   - Logowanie (`src/lib/auth.ts`, provider credentials): użytkownik ARCHI z poprawnym hasłem dostaje odmowę z komunikatem „Portal dla architektów jest w przygotowaniu. Spróbuj później.” (komunikat widoczny na ekranie logowania, nie generyczne „Błędne dane”). ADMIN/STAFF logują się normalnie.
   - Powłoka admina (`src/components/ui/ShellNav.tsx` lub nagłówek layoutu): widoczna plakietka „Tryb wewnętrzny” dla ADMIN/STAFF, żeby nikt nie zapomniał o włączonym przełączniku.
   - Gdy zmienna nieustawiona: zachowanie dokładnie jak dziś (testy regresji muszą to pokrywać).
4. **Ważność cashbacku konfigurowalna.** `src/lib/cashbackExpiry.ts` eksportuje `cashbackExpiresAt(now = new Date())` czytające `CASHBACK_EXPIRY_MONTHS` (domyślnie 12; wartość nieliczbowa lub ≤ 0 → 12 z `console.warn`). Trzy miejsca liczące dziś `setFullYear(+1)` (`src/lib/projectItems.ts` ×2, `src/app/actions/projects.ts` ok. linii 230) używają tej funkcji. Przy `CASHBACK_EXPIRY_MONTHS=24` nowy wpis EARN ma `expires_at` 24 miesiące do przodu.
5. Dokumentacja: `.env.example` (obie zmienne z komentarzem), sekcja Loop 7 planu (ustawić `PORTAL_INTERNAL_MODE=1` i `CASHBACK_EXPIRY_MONTHS=24` w Coolify przy pierwszym wdrożeniu), `CLAUDE.md` „Current task” (Loop 4b zmergowany), `progress.md`.

**Poza zakresem:** zmiana istniejących `expires_at` w bazie; UI do edycji trybu w panelu (zmienna środowiskowa wystarczy); zmiany w agencie.

**Testy (`node:test`, `tests/*.test.ts`, SQLite jak pozostałe):** `nextSubiektCode` (pusta baza → `A-001`; istnieją `A-001`,`A-003` → `A-004`; ręczny kod `A-1200` → `A-1201`; kody niepasujące do wzorca ignorowane); `assignMissingSubiektCodes` nadaje tylko brakujące, kolejność po `created_at`, wpis w activity_logs; każda z 3 ścieżek tworzenia ARCHI zapisuje kod; `sendEmail` w trybie wewnętrznym pomija ARCHI i nieistniejący adres, wysyła do STAFF, a bez zmiennej zachowuje się jak dotąd; `forgot-password` dla ARCHI w trybie wewnętrznym nie tworzy tokenu; `authorize` odmawia ARCHI z właściwym komunikatem, a STAFF wpuszcza; `cashbackExpiresAt` dla 12/24/śmieciowej wartości. E2E (Playwright, jak w Loop 6, przez UI jako admin `admin@dev.local`): lista architektów pokazuje kolumnę „Kod”; szukajka po fragmencie kodu zawęża listę; przycisk „Nadaj brakujące kody” znika po kliknięciu, a kody są widoczne; z `PORTAL_INTERNAL_MODE=1` logowanie architektem `kamila@dev.local` pokazuje komunikat o przygotowaniu, logowanie adminem działa i widać plakietkę.

**Bramka:** `npm test` zielone (wszystkie, nie tylko nowe), `npx tsc --noEmit` tylko z 19 znanymi TS5097, `npm run build` zielony, e2e zielone, sekcja DOWÓD z outputem komend i zrzutami/odpowiedziami. Checklist audytu atrap z §5.

**DoD:** handlowiec (STAFF) wpisuje w szukajce nazwisko architekta i w tym samym wierszu widzi `A-xxx`; nowo zaimportowany architekt ma kod bez udziału admina; przy `PORTAL_INTERNAL_MODE=1` żaden mail nie wychodzi do architekta, architekt nie zaloguje się ani nie zresetuje hasła, a admin pracuje normalnie i widzi plakietkę; przy `CASHBACK_EXPIRY_MONTHS=24` cashback z zamkniętego projektu ma ważność 24 miesiące.

**Stan (2026-10-30, gałąź `subiekt/loop-4b-internal-mode`):**

- [x] 1. Kolumna „Kod” i szukanie po `u.subiekt_code` na liście architektów (`aafd8de`).
- [x] 2. `nextSubiektCode()` w imporcie CSV, rejestracji (`registerArchitect`) i akceptacji zaproszenia (ARCHI); `assignMissingSubiektCodes()` + przycisk „Nadaj brakujące kody” (tylko ADMIN), log `SUBIEKT_CODES_ASSIGNED` (`aafd8de`).
- [x] 3. `PORTAL_INTERNAL_MODE`: `sendEmail`, `forgot-password`, logowanie (credentials; także Google), plakietka w powłoce (`77e4521`).
- [x] 4. `cashbackExpiresAt()` z `CASHBACK_EXPIRY_MONTHS` w trzech miejscach (`b9934e3`).
- [x] 5. `.env.example`, Loop 7, `CLAUDE.md`, `progress.md`.
- [x] Testy (353/353 po poprawkach z przeglądów), tsc (18× TS5097 — o jeden mniej, `subiektMapping.test.ts` ładuje `mapping.ts` przez hook), build, e2e, checklist §5.

#### DOWÓD

`docs/subiekt/LOOP4B-DOWOD-2026-10-30.md` — komendy bramki z wynikiem, przebiegi e2e (Playwright, `next start`, fazy bez i z `PORTAL_INTERNAL_MODE=1` / `CASHBACK_EXPIRY_MONTHS=24`), stan bazy, checklist §5 i uwagi (Google, istniejące sesje JWT architektów).

---

### Loop 5 — Agent na PC z bazą Subiekta GT

**Schemat zweryfikowany w biurze 30.10.2026 (raport użytkownika; warunek wstępny spełniony):**

- Serwer: `192.168.1.150\INSERTGT` (lokalnie `localhost\INSERTGT`), Microsoft SQL Server 2014 SP2 Express (12.0.5000), baza `WD_sp`, port dynamiczny (SQL Browser działa). Login `portal_reader` (db_datareader + DENY INSERT/UPDATE/DELETE/EXECUTE na dbo) utworzony i przetestowany: `SELECT COUNT(*) FROM dok__Dokument` = 28356, UPDATE odrzucony. Komputer `SERWER`, Windows 10 Pro x64 22H2, 24/7, konto `SERWER\Użytkownik` z hasłem; Node nie zainstalowany.
- Pola własne wymagają PLUS → rezygnacja. Znacznik architekta: `dok_Uwagi` zawiera `#A-0002` (portal normalizuje do `A-002`), a kategoria dokumentu `dok_KatId = 14` (`sl_Kategoria.kat_Nazwa = 'Architekt'`) jest flagą. Kategorie nie są używane przez księgowość (biuro zewnętrzne, bez Rewizora/Rachmistrza). Uwagi drukują się na ZK i zostają (decyzja użytkownika).
- `dok_Typ`: ZK = 16 (podtypy 0, 1), FS = 2 (podtypy 0, 1, 3, 4, 5 — znaczenie podtypów nieznane, zob. §6 pkt 13), KFS = 6 (podtypy 0, 2), WZ = 11, PA (paragon) = 21, FZ = 1, KFZ = 5. Dokumentów FP (proforma) w tej bazie nie ma.
- Powiązanie dokumentu pochodnego: `dok__Dokument.dok_DoDokId` → `dok_Id` źródła (FS → ZK, KFS → FS, WZ → KFZ/ZK). Gdy FS powstała z kilku dokumentów, `dok_DoDokNrPelny = '+'` i pojedynczy `dok_DoDokId` nie opisuje wszystkich źródeł. **Test realizacji ZK 142/PUŁ/10/2026 → FS 234/PUŁ/10/2026: ani kategoria (14 → 1), ani Uwagi (`#A-0002` → puste) NIE przeszły na FS.** Architekta FS portal dziedziczy wyłącznie po łańcuchu `parent_external_id`.
- Pozycje: `dok_Pozycja.ob_DokHanId` → `dok_Id`; `ob_TowId` → `tw__Towar.tw_Id` (NULL dla pozycji jednorazowej); `ob_TowRodzaj` (1 = towar, 2 = usługa; pozycje jednorazowe mają zawsze 2); `ob_Opis` (opis pozycji, może być wielowierszowy); `ob_Ilosc`, `ob_Jm`, `ob_CenaNetto`, `ob_WartNetto`, `ob_WartBrutto`, `ob_DokHanLp` (lp), `ob_DoId` (powiązanie pozycji — hipoteza: KFS → korygowana pozycja FS; w FS z ZK było NULL). **ZK 31280 „szyna z montażem”: obie pozycje jednorazowe (`ob_TowId` NULL, `ob_TowRodzaj` 2): „usługa montażu szyny” 300,00 netto i „szyna techno 15 / 484 cm” 536,59 netto. Wg użytkownika to przypadek nietypowy**: reguła „brak karty towaru = montaż” zostaje (uściślenie 5).
- Kontrahent: `dok_PlatnikId` → `kh__Kontrahent.kh_Id` (`kh_Symbol`, `kh_EMail`; brak nazwy i NIP w tej tabeli). Nazwa i NIP z dokumentu: `adrh__Historia` po `dok_PlatnikAdreshId` (`adrh_Nazwa`, `adrh_NazwaPelna`, `adrh_NIP`) z zapasem `adr__Ewid` (`adr_IdObiektu = kh_Id`, `adr_TypAdresu = 1`) — nazwy kolumn do potwierdzenia sondą agenta.
- Płatności: `dok_Rozliczony` NIE jest wiarygodne (0 przy w pełni opłaconej FS 60/MAG/10/2026). Źródło prawdy: `nz__Finanse` z `nzf_IdDokumentAuto = dok_Id`; wiersz należności (`nzf_Typ = 39`, przykład `nzf_Id` 24101) ma `nzf_WartoscPierwotna` = kwota brutto, `nzf_Wartosc` = pozostało do zapłaty, `nzf_Splata`; wpłata (`nzf_Typ = 19`) to osobny wiersz powiązany przez `nz_FinanseSplata` (`nzs_IdDlugu`, `nzs_IdSplaty`). `is_paid` = suma `nzf_Wartosc` (pozostało) dla należności dokumentu ≤ 0,005 i istnieje co najmniej jedna należność; brak należności → `is_paid = false`.
- Korekty: KFS 6/PUŁ/10/2026 (31243) → FS 185/PUŁ/10/2026 (31242) przez `dok_DoDokId`, `dok_WartNetto` = −3741,50; KFS 5/MAG/10/2026 (31299) → FS 90/MAG/09/2026 (30374), −28,46.
- Rozrachunki pomocnicze: `zd_Rozrachunek`, `zw_Rozrachunek` (wezwania/odsetki) — nieużywane.
- Uwaga: FS 234/PUŁ/10/2026 powstała jako test w bazie produkcyjnej; jej los (wycofanie/korekta) ustala użytkownik z księgowością.

**Uściślenia Loopa 5 wynikające z weryfikacji (nadpisują wcześniejsze założenia tej sekcji):**

1. **Uruchamianie:** TypeScript kompilowany `tsc` do `agent-subiekt/dist/`, uruchamiany `node dist/main.js` (Node LTS 22 na Windows 10; bez `tsx` w produkcji). Testy agenta na Macu: `node --test agent-subiekt/tests/*.test.ts` (Node 25, type stripping), bez połączenia z SQL.
2. **Połączenie:** `mssql` (tedious) z `server: SUBIEKT_DB_SERVER` (domyślnie `localhost`), `options.instanceName: SUBIEKT_DB_INSTANCE` (domyślnie `INSERTGT`; gdy ustawiony `SUBIEKT_DB_PORT`, port zamiast instancji), `options.trustServerCertificate: true`, `options.encrypt: false` (lokalny SQL 2014), `options.readOnlyIntent: true`, `requestTimeout` 120 s. `ARCHITECT_FIELD_MODE` zastąpione przez stałe: `ARCHITECT_CATEGORY_ID=14` i znacznik w Uwagach; konfigurowalne w `.env`, z domyślnymi wartościami.
3. **Wybór dokumentów (chain.ts):** korzeń = dokument typu ZK (16) lub FS (2) z `dok_DataWyst ≥ dziś − LOOKBACK_MONTHS`, który ma `dok_KatId = ARCHITECT_CATEGORY_ID` **lub** `dok_Uwagi` pasujące do `/#A[-_]?[A-Za-z0-9]{1,16}/i`. Pochodne: wszystkie dokumenty typu WZ/FS/KFS, których `dok_DoDokId` wskazuje dokument już w zbiorze (iteracyjnie, do ustalenia się zbioru). Dokumenty poza tym zbiorem nigdy nie są wysyłane (zwykła sprzedaż). FS z `dok_DoDokNrPelny = '+'` (wiele źródeł): jeśli `dok_DoDokId` wskazuje dokument ze zbioru → traktuj normalnie; inaczej, jeśli dokładnie jeden korzeń ZK ze zbioru ma tego samego `dok_PlatnikId`, datę ≤ data FS i nie ma jeszcze żadnej FS w łańcuchu → przyjmij go za rodzica i zapisz ostrzeżenie `MULTI_SOURCE_HEURISTIC` w logu i podsumowaniu; inaczej pomiń i wypisz w podsumowaniu sekcję „FS wielodokumentowe bez jednoznacznego ZK” (numer, kontrahent, kwota) do ręcznej obsługi. `architect_code` w paczce zawsze `null` (portal czyta znacznik z `remarks`); `remarks` = `dok_Uwagi` przycięte do 4000 znaków.
4. **Payload:** `type` z mapy `dok_Typ` (16→ZK, 2→FS, 6→KFS, 11→WZ; inne typy nigdy nie wchodzą do zbioru); `number` = `dok_NrPelny` (trim); `issued_at` = `dok_DataWyst` jako `YYYY-MM-DD` w czasie lokalnym serwera (bez konwersji UTC); `contractor_name` = `adrh_NazwaPelna` lub `adrh_Nazwa` lub `kh_Symbol`; `contractor_nip` = `adrh_NIP` znormalizowany (same cyfry) lub null; `parent_external_id` = `dok_DoDokId` (lub z heurystyki); `net_total`/`gross_total` = `dok_WartNetto`/`dok_WartBrutto` zaokrąglone do 2 miejsc (KFS ujemne); `is_paid` wg `nz__Finanse` (powyżej); pozycje: `external_id = ob_Id`, `ordinal = ob_DokHanLp`, `product_id = ob_TowId`, `name` = pierwsza niepusta linia `ob_Opis`, a gdy puste — `tw__Towar.tw_Nazwa`; wielowierszowy `ob_Opis` łączony spacją i przycięty do 255; `unit = ob_Jm` (max 16), `quantity = ob_Ilosc`, `unit_price_net = ob_CenaNetto`, `net_total = ob_WartNetto`; `corrects_position_external_id`: dla KFS `ob_DoId` jeśli wskazuje pozycję FS-rodzica, inaczej dopasowanie po (`product_id`, `name`) do pozycji FS-rodzica, inaczej null.
5. **Reguła typu pozycji bez zmian** (decyzja użytkownika 30.10.2026): pozycja jednorazowa (`ob_TowId` NULL) = montaż/usługa zgodnie z procedurą firmy; przykład ZK 31280 był nietypowy.
6. **Sonda `--probe`:** `node dist/main.js --probe` łączy się, sprawdza przez `INFORMATION_SCHEMA.COLUMNS` istnienie wszystkich używanych tabel i kolumn (lista w `queries.ts`), wypisuje brakujące z sugestią najbliższych nazw, pokazuje liczność dokumentów wg `dok_Typ`/`dok_Podtyp` z ostatnich `LOOKBACK_MONTHS`, liczbę korzeni (kategoria / znacznik / oba), 5 przykładów każdego podtypu FS w zbiorze, przykład `nz__Finanse` dla najnowszej FS ze zbioru oraz wynik `SELECT TOP 1` z `adrh__Historia`. Kończy się kodem 0 tylko gdy wszystkie kolumny istnieją. `--dry-run` zapisuje paczkę do `logs/dry-run-<data>.json` i podsumowanie `logs/dry-run-<data>.txt` (liczba dokumentów wg typu, lista korzeni z kodami, ostrzeżenia heurystyki, FS pominięte). `--since YYYY-MM-DD` nadpisuje `LOOKBACK_MONTHS`.
7. **Harmonogram:** `install-task.ps1` rejestruje zadanie „Portal Archi – sync Subiekt” codziennie 20:00, `node.exe dist\main.js` w katalogu agenta, konto bieżącego użytkownika z hasłem (parametr), „Run whether user is logged on or not”, „Run with highest privileges” NIE; `uninstall-task.ps1` usuwa. README: instalacja Node 22 LTS (msi), `npm ci`, `npm run build`, `.env` z `.env.example`, `--probe`, `--dry-run`, `install-task.ps1`, gdzie są logi, jak odczytać kod wyjścia.
8. **Testy agenta** (`agent-subiekt/tests/*.test.ts`, `node:test`, bez SQL): `chain.ts` — ZK z kategorią bez znacznika → korzeń; ZK ze znacznikiem bez kategorii → korzeń; zwykła FS bez łańcucha → poza zbiorem; FS → ZK przez `dok_DoDokId` → w zbiorze; ZK → WZ → FS → KFS → cały łańcuch; FS `'+'` z jednym kandydatem → rodzic z heurystyki i ostrzeżenie; FS `'+'` z dwoma kandydatami → pominięta i w raporcie; `payload.ts` — pozycja jednorazowa → `product_id: null`; wielowierszowy `ob_Opis` → `name` jedna linia ≤ 255; `issued_at` `YYYY-MM-DD`; kwoty 2 miejsca; KFS `corrects_position_external_id` z `ob_DoId` i z dopasowania; `paid.ts` — należność z `nzf_Wartosc` 0 → paid; częściowa → unpaid; brak należności → unpaid; `send.ts` — podpis zgodny z `verifySubiektRequest` z `src/lib/subiekt/auth.ts` (test importuje obie strony), podział po 200 i ten sam `run_id`, retry z backoffem (timer wstrzykiwany), log do pliku. Portal bez zmian: walidator portalu nadal przyjmuje paczki agenta (test agenta `contract.test.ts` przepuszcza paczkę przez `parseSyncRequest`).
9. **DoD Loopa 5 (uzupełnienie):** na Macu zielone testy agenta i portalu, `tsc` agenta bez błędów, `npm run build` portalu; na PC `SERWER`: `--probe` kod 0, `--dry-run` z paczką zawierającą ZK 115/PUŁ/10/2026 (31280) i ZK 142/PUŁ/10/2026 (31482) z FS 234/PUŁ/10/2026 (31483) jako pochodną, bez żadnej FS zwykłej sprzedaży (ręczna kontrola listy korzeni w `dry-run-<data>.txt` przez użytkownika). Kroki 3–5 wykonuje użytkownik na PC według README; wynik (log, podsumowanie) wraca jako sekcja DOWÓD.


**Warunek wstępny (weryfikacja w biurze, przed kodem):**

1. W GT: czy ZK i FS mają zakładkę pól własnych (Parametry → Pola własne → Dokumenty). Jeśli tak, dodać pole słownikowe „Architekt” z wartościami w formacie `A-001 Nazwisko`. Jeśli nie, umówić znacznik `#A-001` w polu „Uwagi” ZK (uwagi kopiują się na FS, potwierdzone).
2. W SSMS na kopii bazy: zlokalizować tabele nagłówków (`dok__Dokument`), pozycji (`dok_Pozycja`), kontrahentów (`kh__Kontrahent`), towarów (`tw__Towar`) i miejsce zapisu pola własnego dokumentu. Zapytanie pomocnicze do znalezienia tabeli z wartością pola własnego (wpisz wcześniej w GT wartość `ARCHTEST`):

```sql
DECLARE @needle NVARCHAR(100) = N'ARCHTEST';
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'IF EXISTS (SELECT 1 FROM ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
    + N' WHERE ' + QUOTENAME(c.name) + N' LIKE N''%' + @needle + N'%'') PRINT ''' + s.name + N'.' + t.name + N'.' + c.name + N''';' + CHAR(10)
FROM sys.columns c
JOIN sys.tables t ON c.object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.types ty ON c.user_type_id = ty.user_type_id
WHERE ty.name IN ('nvarchar','varchar','nchar','char','ntext','text');
EXEC sp_executesql @sql;
```

3. Potwierdzić wartości `dok_Typ` dla FS, KFS, ZK, FP, WZ (`SELECT DISTINCT dok_Typ, dok_NrPelny FROM dok__Dokument` i porównać z numerami na wydrukach), kolumnę powiązania dokumentu pochodnego z źródłowym (w GT pozycja dokumentu pochodnego wskazuje pozycję źródłową; nazwę kolumny potwierdzić w `dok_Pozycja`) oraz kolumnę statusu rozliczenia (`dok_StatusRozliczenia` lub odpowiednik w rozrachunkach `rr__Rozrachunek`).
4. Wyniki wpisać do `agent-subiekt/README.md` w sekcji „Schemat bazy (zweryfikowano DD.MM.RRRR)” i do `agent-subiekt/src/queries.ts` jako stałe. Dopóki punkt 3 nie jest potwierdzony, loop 5 nie startuje.

**Pliki:** `agent-subiekt/package.json` (zależności: `mssql`, `tsx` do uruchamiania TS; bez frameworków), `agent-subiekt/src/config.ts` (czyta `.env`: `SUBIEKT_DB_SERVER`, `SUBIEKT_DB_NAME`, `SUBIEKT_DB_USER`, `SUBIEKT_DB_PASSWORD`, `PORTAL_URL`, `SUBIEKT_SYNC_TOKEN`, `SUBIEKT_SYNC_SECRET`, `LOOKBACK_MONTHS=18`, `ARCHITECT_FIELD_MODE=custom_field|remarks`), `src/db.ts` (pool `mssql`, `readOnlyIntent: true`), `src/queries.ts` (SQL z 3.), `src/chain.ts` (budowa łańcuchów i filtr „tylko dokumenty z architektem lub pochodne od takich”), `src/payload.ts` (mapowanie wierszy → `SubiektDocumentPayload`, import typów z `../../src/lib/subiekt/types.ts`), `src/send.ts` (podpis HMAC identyczny z `auth.ts`, podział po 200, retry 3× z backoffem 10 s / 60 s / 5 min, log do pliku `logs/YYYY-MM-DD.log`), `src/main.ts`, `install-task.ps1` (rejestracja zadania w Harmonogramie: codziennie 20:00, uruchom `node --import tsx src/main.ts`, konto usługowe, „uruchom nawet gdy użytkownik nie jest zalogowany”), `README.md` (instalacja Node LTS, utworzenie loginu SQL tylko do odczytu, test ręczny `npm run sync -- --dry-run`).

Login SQL do utworzenia na serwerze Subiekta (w README):

```sql
CREATE LOGIN portal_reader WITH PASSWORD = '<silne hasło>';
USE <NazwaBazySubiekta>;
CREATE USER portal_reader FOR LOGIN portal_reader;
ALTER ROLE db_datareader ADD MEMBER portal_reader;
```

Tryb `--dry-run`: buduje paczkę, zapisuje ją do `logs/dry-run-<data>.json`, nic nie wysyła. Tryb `--since 2026-01-01` nadpisuje `LOOKBACK_MONTHS`.

Testy agenta (`agent-subiekt/tests/*.test.ts`, `node:test`, bez połączenia z SQL): `chain.ts` na sztucznych wierszach (ZK z architektem + FS pochodna bez architekta → obie w paczce; FS zwykłej sprzedaży bez łańcucha do oznaczonego ZK → poza paczką); `payload.ts` (pozycja z `tw_Id = NULL` → `product_id: null`; kwoty zaokrąglone do 2 miejsc; `issued_at` jako `YYYY-MM-DD`); `send.ts` (podpis zgodny z `verifySubiektRequest` z portalu — test importuje obie funkcje i sprawdza `ok: true`).

- [ ] Krok 1: weryfikacja w biurze (punkty 1–4 powyżej), wpis do README.
- [x] Krok 2: testy agenta → implementacja → `node --test agent-subiekt/tests/*.test.ts` zielone (2026-10-30, dowód niżej).
- [ ] Krok 3: na PC z bazą: `npm run sync -- --dry-run` → plik JSON z dokumentami; ręcznie sprawdzić, że są w nim tylko dokumenty z architektem i pochodne, a nie ma zwykłej sprzedaży; liczba dokumentów zgodna z ręcznym zliczeniem w GT (filtr po polu własnym).
- [ ] Krok 4: `npm run sync` na portal dev wystawiony tunelem (np. `cloudflared tunnel --url http://localhost:3000`) lub bezpośrednio na produkcję po loopie 7 → odpowiedź 200, panel pokazuje uruchomienie.
- [ ] Krok 5: `install-task.ps1` → zadanie widoczne w Harmonogramie; „Uruchom teraz” → log z sukcesem; następnego dnia o 20:00 nowy wpis w „Ostatnie uruchomienia”.
- [ ] Krok 6: commit `feat(subiekt): read-only agent for Subiekt GT with scheduled daily sync`.

**DoD:** pracownik w biurze wystawia ZK z polem „Architekt = A-001”, a następnego dnia rano architekt A-001 widzi w portalu nowy projekt z pozycjami i prowizją w toku, bez udziału admina. Wystawienie FS z tego ZK zmienia pozycje na fakturowe po kolejnej synchronizacji. Zwykła FS bez architekta nigdy nie pojawia się w portalu (sprawdzone: `SELECT COUNT(*) FROM subiekt_documents` równe liczbie dokumentów oznaczonych + pochodnych).

#### DOWÓD — część na Macu (2026-10-30, gałąź `subiekt/loop-5-agent`)

Kod: `agent-subiekt/` (commity `cb76d64` agent, `d37c83d` poprawka filtra daty). Portal bez zmian (decyzja użytkownika: reguła typu pozycji zostaje; `is_service` wycofane). Kroki 3–5 (PC `SERWER`) czekają na użytkownika według `agent-subiekt/README.md`.

Odstępstwa od tekstu planu (świadome): typy paczki skopiowane do `agent-subiekt/src/contract.ts` (import spoza `rootDir` daje TS6059, a `dist/` ma działać bez kodu portalu) — zgodność pilnuje `tests/contract.test.ts` (paczka agenta przez prawdziwy `parseSyncRequest`, `deepEqual` po walidacji); `name` = niepuste linie `ob_Opis` połączone spacją (≤ 255); na KFS pomijane wiersze `ob_Znak = −1` (hipoteza „stan przed korektą”, §6 pkt 15); FS '+' płatnika bez żadnego oznaczonego ZK tylko liczona (§6 pkt 16); `.env` czytane wbudowanym `process.loadEnvFile` (bez `dotenv`).

Bramka (Node 25.8.1):

```
npm run test:agent          → ℹ tests 28 · pass 28 · fail 0   (chain 9, payload 5, paid 4, send 6, contract 2, probe 2)
npm test                    → ℹ tests 353 · pass 353 · fail 0
npx tsc --noEmit            → 18 × error TS5097 (bez innych; agent-subiekt wyłączony z tsconfig portalu)
cd agent-subiekt && npx tsc -p tsconfig.json --noEmit → exit 0
cd agent-subiekt && npm run build → exit 0, dist/: chain config contract db main paid payload probe queries report send (.js)
npm run build               → exit 0 (Compiled successfully, 23/23 stron)
```

Test integracyjny (poza wymaganiami planu): Azure SQL Edge 15.0 (ARM64, Docker) z syntetyczną bazą `WD_sp` — kolumny i typy z raportu 30.10.2026, przypadki ZK 115 (31280), ZK 142 → FS 234 (31482 → 31483), FS 60/MAG opłacona (31480, zwykła sprzedaż), ZK → FS 185 → KFS 6 (31200 → 31242 → 31243, wiersze `ob_Znak` −1/1), FS '+', ZK sprzed okresu, PA ze znacznikiem; login `portal_reader` z `db_datareader` + DENY. Skompilowany `node dist/main.js`:

- `--probe` → `OK: 8 tabel, 46 kolumn — wszystkie istnieją`, liczności wg typu/podtypu, `kat_Id 14: „Architekt”`, `Korzenie: 3 (tylko kategoria 1, tylko znacznik 1, oba 1)`, przykłady FS wg podtypu, `nz__Finanse`, `adrh__Historia` TOP 1, pozycje KFS z `ob_Znak`/`ob_DoId`; `WYNIK: OK (kod 0)`. Po zmianie nazwy `adrh_NazwaPelna` → `BRAK KOLUMNY adrh__Historia.adrh_NazwaPelna — najbliższe nazwy: adrh_Nazwa`, `WYNIK: BŁĄD (kod 2)`, exit 2. Pierwszy przebieg wykrył błąd `CONVERT(datetime, @since, 23)` („Conversion failed…”) → styl 126 (`d37c83d`).
- `--dry-run` → exit 0, `logs/dry-run-2026-10-30.{json,txt}`: 7 dokumentów (ZK 3, FS 3, KFS 1); korzenie ZK 100, ZK 115 („BRAK ZNACZNIKA … kategoria Architekt”, pod nim FS 240 „rodzic z heurystyki”), ZK 142 z FS 234; FS 60/MAG, PA i ZK sprzed okresu poza paczką; KFS wysyła tylko pozycję po korekcie (600, `corrects_position_external_id` 58101); `is_paid` FS 185 true, FS 234 false (pozostało 230); NIP „PL 716-000-11-22” → `7160001122`.
- sync na `next dev -p 3605` (świeża baza z `seed-dev.mjs`, kody A-002/A-007 nadane w bazie testowej): `Strona 1/1: dokumentów 7, przyjęte 7, bez zmian 0, nieprzypisane 2, odrzucone 0`, exit 0; drugi raz `przyjęte 0, bez zmian 7`, exit 0; zły sekret → `HTTP 401: {"error":"BAD_SIGNATURE"}`, exit 3. W bazie: 31200/31242/31243 i 31482/31483 `AUTO`, 31280 i 31600 `UNASSIGNED NO_ARCHITECT`; projekty „Firma Sp. z o.o. — ZK 100/PUŁ/10/2026” (A-007) i „Nowak — ZK 142/PUŁ/10/2026” (A-002) PRZYJĘTY; pozycje FS 185: Tapeta 600 (po KFS 800 → 600), Montaż fototapety 500; FS 234: 1000; `subiekt_sync_runs` 2 × `DONE`.
- `install-task.ps1` / `uninstall-task.ps1`: parser PowerShell 7.4 — 0 błędów; nazwa zadania „Portal Archi – sync Subiekt” odczytana poprawnie (UTF-8 z BOM, CRLF, `.gitattributes`). Rejestracji zadania nie da się sprawdzić poza Windows — krok 5.
- Odczyt jako `portal_reader`: `UPDATE dbo.dok__Dokument …` → „The UPDATE permission was denied”.

#### DOWÓD — poprawki po przeglądzie jakości (2026-10-30)

Commity `8140a97` (przodkowie spoza okresu), `1dc1d20` (heurystyka '+' na całej historii płatnika), `351f642` (kod 4 przy dokumentach do ręcznej obsługi), `ae1a5fb` (kwoty / numer → PayloadError; znacznik korzenia tylko `#A` + 1–6 cyfr), `831a54e` (log przed konfiguracją, ścisłe `--since`, kod 5, BOM w `.env`), `a3e3a7e` (timeout 90 s, kontrola odpowiedzi, 429, kolejność stron rodzic → dziecko), `40ca984` (dzienny log bez nazw klientów, `logs/last-sync.txt`, retencja 90 dni), `2d84a35` (sonda: ZK/FS wg `dok_Status`), `928ed2a` (`install-task.ps1 -Force` + `ZeroFreeBSTR`, README). Portal `src/` i `tests/` bez zmian (`git diff 6fba483 -- src tests` pusty).

Bramka (Node 25.8.1):

```
npm run test:agent          → ℹ tests 54 · pass 54 · fail 0   (chain 18, send 10, payload 6, config 6, paid 4, report 4, contract 2, probe 2, queries 2)
npm test                    → ℹ tests 353 · pass 353 · fail 0
npx tsc --noEmit            → 18 × error TS5097 (bez innych)
cd agent-subiekt && npx tsc -p tsconfig.json --noEmit → exit 0
cd agent-subiekt && npm run build → exit 0
npm run build               → exit 0 (Compiled successfully, 23/23 stron)
install-task.ps1            → parser PowerShell 7.4: 0 błędów
```

Ponowny test integracyjny (SQL Edge 15.0, baza z pierwszego testu + `dok_Status` + nowe przypadki: ZK 1/PUŁ/01/2024 → FS 2/PUŁ/02/2024 → KFS 9/PUŁ/10/2026; scenariusz z przeglądu — płatnik 900, ZK 5/PUŁ/01/2025 sprzed okresu, ZK 50/PUŁ/06/2025, FS 70/PUŁ/07/2025 '+'; ZK z „#Adam dzwonił”), `--since 2025-04-30`:

- `--probe` → `OK: 8 tabel, 47 kolumn`, `Korzenie: 5`, `Heurystyka FS '+': 1, niejednoznaczne: 1`, `ZK dok_Status 1: 5`, `FS dok_Status 1: 4`, `WYNIK: OK (kod 0)`.
- `--dry-run` → **exit 4**; `DO RĘCZNEJ OBSŁUGI: 1 … — kod wyjścia 4`; korzeń `ZK 1/PUŁ/01/2024` z `FS 2/PUŁ/02/2024` i `KFS 9/PUŁ/10/2026` (przodkowie spoza okresu); `FS 70/PUŁ/07/2025 … kandydaci: ZK 50/PUŁ/06/2025, ZK 5/PUŁ/01/2025` (nie przypięta do ZK z okresu); ZK z „#Adam” poza paczką; FS 240 nadal przypięta do ZK 115 (ZK 1/2024 ma już FS).
- sync na `next dev` (świeża baza) → exit 4 dwa razy: `przyjęte 11, nieprzypisane 3`, potem `bez zmian 11`; `subiekt_documents` 1000/1001/31700 `AUTO` (łańcuch 1000), 31800 `UNASSIGNED NO_ARCHITECT`; dzienny log bez nazw kontrahentów (0 trafień), szczegóły i „WYNIK WYSYŁKI” w `logs/last-sync.txt`.
- `env -i node dist/main.js --since 2026-02-30` → exit 1, w `logs/RRRR-MM-DD.log`: `ERROR Błąd konfiguracji: --since: „2026-02-30” nie jest poprawną datą …`.

#### DOWÓD — poprawki przed merge (2026-10-30)

Commit `8d6d65f`: `pruneLogsSafely` (plik logu, którego nie da się usunąć, i nieczytelny katalog → ostrzeżenie, uruchomienie trwa); logger nie rzuca przy błędzie zapisu pliku (wiersz na konsolę, jednorazowa informacja — wykryte przy teście zablokowanego pliku: ostrzeżenie o nim samo przerywało uruchomienie); każdy błąd fazy konfiguracji (nie tylko `ConfigError`) → dzienny log i kod 1; sonda pokazuje kolację bazy.

```
npm run test:agent          → ℹ tests 56 · pass 56 · fail 0   (send 12: + pruneLogsSafely z rm rzucającym EBUSY i readdir rzucającym EACCES, + logger przy EACCES)
npm test                    → ℹ tests 353 · pass 353 · fail 0
npx tsc --noEmit            → 18 × error TS5097 (bez innych)
cd agent-subiekt && npx tsc -p tsconfig.json --noEmit → exit 0;  npm run build → exit 0
npm run build               → exit 0 (Compiled successfully, 23/23 stron)
```

- `.env` z `chmod 000` → exit 1, w dziennym logu `ERROR Błąd konfiguracji (odczyt .env lub argumentów): EACCES: permission denied, open '…/agent-subiekt/.env'`.
- SQL Edge, `logs/2026-01-01.log` z `chflags uchg` (nieusuwalny) + `logs/2026-01-02.log`: `--probe` → exit 0, w logu `WARN Nie udało się usunąć starego logu 2026-01-01.log: EPERM, Operation not permitted …`, `Usunięto logi starsze niż 90 dni: 1` (2026-01-02.log usunięty), sonda: `Kolacja: Polish_CI_AS — bez rozróżniania wielkości liter`, `WYNIK: OK (kod 0)`.

---

### Loop 5b — Uzgodnienie faktur z zamówieniem (portal; dodany 2026-10-30)

**Problem.** Faktura w GT nie musi odzwierciedlać rozbicia ZK: przy montażu FS końcowa bywa jedną zbiorczą pozycją „usługa” na całą kwotę, a zaliczki i faktury częściowe rozkładają kwotę ZK na kilka FS. Dzisiejsza reguła „FS zastępuje pozycje ZK” liczyłaby wtedy prowizję z błędnego rozbicia (cały montaż albo cały produkt) lub podwójnie (zaliczka + końcowa). Decyzja użytkownika 2026-10-30: ZK jest źródłem rozbicia produkt/montaż, faktury źródłem kwoty i zapłaty; przy równych sumach automat, przy rozbieżności ręczne uzgodnienie przez admina.

**Definicje (łańcuch = korzeń ZK + przypisane WZ/FS/KFS o tym samym `root_external_id`; `src/lib/subiekt/reconcile.ts`, czyste funkcje):**
- `zkNet` = `net_total` ZK; `invoicedNet` = Σ `net_total` FS + Σ `net_total` KFS (KFS ujemne) łańcucha, zaokrąglone do 2 miejsc.
- `mirrors(zkPositions, fsPositions)` = liczba pozycji FS (jak na fakturze — **przed** korektami KFS, bez pozycji ≤ 0) równa liczbie pozycji ZK (bez ≤ 0) **i** każda pozycja FS ma dokładnie jedną niewykorzystaną pozycję ZK o tym samym kluczu (`product_id`, gdy oba niepuste; inaczej nazwa po `trim().toLowerCase()` ze zbitymi białymi znakami) i `net_total` równym w tolerancji `AMOUNT_EPSILON`.
- `fingerprint` = posortowana lista `external_id:net_total` wszystkich FS i KFS łańcucha, połączona `;`.
- Tryb łańcucha (`chainMode`): brak FS → `ORDER_ONLY`; brak ZK (FS-sierota przypisana ręcznie) → `INVOICE_ONLY`; `mirrors` → `MIRROR`; `|invoicedNet − zkNet| < AMOUNT_EPSILON` → `ORDER_BREAKDOWN`; inaczej → `RECONCILE`.

**Zachowanie syncu (`mappingDb.ts` → `syncChainOf`):**
- `ORDER_ONLY`, `INVOICE_ONLY`, `MIRROR`: jak dziś (pozycje odpowiednio z ZK, z FS, z FS). W `MIRROR` korekty KFS trafiają w pozycje FS jak przed Loop 5b (KFS wskazuje konkretną pozycję, więc rozbicie zostaje znane) — np. Loop 6 krok 8 nie otwiera uzgodnienia. KFS liczą się do `invoicedNet` i `fingerprint`, więc w łańcuchu bez odzwierciedlenia (ORDER_BREAKDOWN / RECONCILE) nowa korekta przywraca pytanie. *(Poprawka po przeglądzie 2026-10-31, §6 pkt 19.)*
- `ORDER_BREAKDOWN`: pozycje z ZK (usunąć pozycje FS łańcucha, jeśli były), każda pozycja: `invoice_number` = numery FS łańcucha po przecinku w kolejności `issued_at` (przycięte do 255), `is_paid` = wszystkie FS łańcucha zapłacone, `order_number` = numer ZK, kwota z ZK. Bez udziału admina. Jeśli dla łańcucha istnieje RESOLVED uzgodnienie z tym samym `fingerprint`, kwoty bierze się z uzgodnienia (patrz niżej), bo admin mógł je już ręcznie poprawić, zanim sumy się zrównały.
- `RECONCILE`: pozycje z ZK jak wyżej, ale: (a) w `subiekt_reconciliations` powstaje lub aktualizuje się wiersz łańcucha (`project_id`, `root_external_id`, `status = 'OPEN'`, `zk_net`, `invoiced_net`, `fingerprint`, `opened_at`), chyba że istnieje RESOLVED z identycznym `fingerprint` → wtedy stosuje się zapisane kwoty (`amounts_json`: `subiekt_position_id` → `amount_net`; pozycja z kwotą 0 jest usuwana) i status zostaje RESOLVED; (b) gdy RESOLVED, ale `fingerprint` się zmienił (nowa FS/KFS, zmiana kwoty) → status wraca na `OPEN`, poprzednie kwoty zostają na pozycjach do czasu nowej decyzji; (c) wpis `activity_logs` `SUBIEKT_RECONCILIATION_OPENED` (`user_id` NULL, `subject_id` = id dokumentu ZK, metadata: `zk_net`, `invoiced_net`, numery FS/KFS) tylko przy przejściu do OPEN, nie przy każdym syncu.
- Przejście łańcucha z `MIRROR` do `ORDER_BREAKDOWN`/`RECONCILE` (np. doszła FS zbiorcza) usuwa pozycje FS i tworzy pozycje ZK przez istniejące core (w ZAKOŃCZONY: korekty do 0 jak dziś). Przejście odwrotne analogicznie. Kiedy łańcuch wraca do `MIRROR` lub `ORDER_BREAKDOWN` z równymi sumami, otwarte uzgodnienie zamyka się automatycznie (`status = 'AUTO_CLOSED'`, wpis `SUBIEKT_RECONCILIATION_CLOSED`).
- Ponowne otwarcie RESOLVED (zmiana odcisku albo pozycji ZK): pozycje, którym admin dał kwotę 0, wracają z kwotą z ZK (przez rdzeń: `addItemCore`, w ZAKOŃCZONY korekta w górę) i są w formularzu do nowej decyzji; pozostałe kwoty admina zostają. *(Poprawka po przeglądzie 2026-10-31, §6 pkt 22.)*
- `type_overridden` pozycji nadal respektowany; `assertManualItem` bez zmian (pozycje SUBIEKT nieedytowalne poza uzgodnieniem).

**Blokady przy OPEN:** `computeSuggestedStatus` nigdy nie zwraca `ZAKOŃCZONY` dla projektu z OPEN uzgodnieniem (zwraca `W_REALIZACJI`, a `SuggestedStatusBanner` dostaje `reason: 'RECONCILE_OPEN'` i pokazuje „Najpierw uzgodnij faktury z zamówieniem”); `updateProjectStatus(..., 'ZAKOŃCZONY')` dla takiego projektu zwraca błąd domenowy „Projekt ma nieuzgodnione faktury z Subiekta. Uzgodnij je przed zakończeniem.” (bez wyjątku w UI; istniejący wzorzec `{ ok, error }` dla akcji Subiekta, a dla `updateProjectStatus` zgodnie z jego obecnym kontraktem zwrotu).

**Uzgodnienie przez admina (`src/lib/subiekt/adminOps.ts` → `resolveReconciliation`, akcja `src/app/actions/subiekt.ts` → `resolveReconciliationAction`, ADMIN i STAFF jak inne operacje operacyjne; jedna transakcja):** wejście: `projectId`, `rootExternalId`, lista `{ itemId, amount_net }` dla WSZYSTKICH pozycji SUBIEKT łańcucha (kwoty ≥ 0, 2 miejsca), opcjonalna `note` ≤ 500. Walidacja: Σ kwot = `invoicedNet` ± `AMOUNT_EPSILON`, każda pozycja należy do łańcucha i projektu, uzgodnienie jest OPEN i jego `fingerprint` zgadza się z bieżącym stanem dokumentów (inaczej błąd „Dokumenty zmieniły się, odśwież stronę”). Skutek: `updateItemAmountCore` dla zmienionych kwot, `deleteItemCore` dla kwot 0 (przez istniejący `removeSubiektItem`), zapis `amounts_json`, `status = 'RESOLVED'`, `resolved_at`, `resolved_by`, wpis `SUBIEKT_RECONCILIATION_RESOLVED` (`user_id` admina, `subject_id` = id dokumentu ZK, metadata: kwoty przed/po). Zwrot `{ ok: true } | { ok: false, error }`.

**UI:**
- Strona projektu admina: karta `ReconciliationCard.tsx` nad pozycjami, widoczna tylko przy OPEN: kwota ZK, kwota faktur (po KFS), różnica, numery FS/KFS z datami, tabela pozycji łańcucha (opis, typ, kwota z ZK, pole kwoty do wpisania), suma na żywo z kolorem (zgodna / niezgodna), przycisk „Zapisz uzgodnienie” aktywny tylko przy zgodnej sumie, pole notatki. Po zapisie karta znika, pozycje pokazują nowe kwoty, prowizje przeliczone (widoczne w karcie pozycji), baner statusu znów podpowiada. Przy RESOLVED: jedna linia w karcie dokumentów Subiekta „Faktury uzgodnione ręcznie DD.MM.RRRR przez X” z linkiem do historii.
- Strona integracji (`/dashboard/admin/integrations/subiekt`): sekcja „Do uzgodnienia (n)” z listą projektów (architekt, nr ZK, kwota ZK, kwota faktur, różnica, od kiedy OPEN) z linkami do projektu; licznik w plakietce menu doliczany do „nieprzypisanych” (osobny tooltip/etykieta „nieprzypisane + uzgodnienia”).
- Widok architekta: pozycje jak dotąd; przy OPEN w karcie projektu krótka informacja „Faktury w uzgadnianiu” zamiast kwoty „do zafakturowania” (bez szczegółów kwot faktur).
- Karta „Zmiany dokumentów (Subiekt)” pokazuje nowe typy wpisów (`getProjectZkChanges` rozszerzony o `SUBIEKT_RECONCILIATION_*`), czytelnie sformatowane w `diff.ts`/`labels.ts`.

**Dodatkowo (zamyka §6 pkt 18):** `REMARKS_MARKER` w `src/lib/subiekt/mapping.ts` zawężony do kodu numerycznego `/#A[-_]?(\d{1,6})(?![A-Za-z0-9])/i`, spójnie z agentem; „#Adam” nie daje już kodu „A-DAM”; test.

**Schemat:** migracja `021_subiekt_reconciliations.sql` + `scripts/ensure-production-schema.mjs` + `scripts/seed-dev.mjs`: `subiekt_reconciliations(id VARCHAR(36) PK, project_id VARCHAR(36) NOT NULL, root_external_id INTEGER NOT NULL, status VARCHAR(16) NOT NULL, zk_net DECIMAL(12,2) NOT NULL, invoiced_net DECIMAL(12,2) NOT NULL, fingerprint VARCHAR(2000) NOT NULL, amounts_json MEDIUMTEXT NULL, note VARCHAR(500) NULL, opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME NULL, resolved_by VARCHAR(36) NULL, UNIQUE(project_id, root_external_id))`, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, indeks `(status)`. Łączenie/przenoszenie projektów (`adminOps.merge`, `moveChain`) przenosi wiersze uzgodnień razem z dokumentami.

**Testy (`node:test`, SQLite):** `reconcile.ts` — `mirrors` (identyczne pozycje → true; jedna zbiorcza „usługa” → false; inna kwota → false; klucz po `product_id` i po nazwie), `chainMode` dla 5 trybów, `fingerprint` stabilny względem kolejności; `mappingDb` — ZK 2 pozycje (produkt 536,59 + montaż 300,00) + FS zbiorcza 836,59 jedna pozycja „usługa” → tryb `ORDER_BREAKDOWN`, pozycje z ZK, prowizja z 536,59, `invoice_number` = nr FS, brak uzgodnienia; ta sama FS na 900,00 → `RECONCILE`, OPEN, pozycje z ZK, status podpowiedzi nie ZAKOŃCZONY, `updateProjectStatus` ZAKOŃCZONY odrzucony; `resolveReconciliation` 600+300 → RESOLVED, kwoty zaktualizowane, prowizja z 600, ponowny sync bez zmian dokumentów nie nadpisuje; dojście KFS −100 → fingerprint zmieniony → OPEN ponownie, kwoty 600/300 zostają; FS zaliczkowa 300 + końcowa 836,59 (suma 1136,59 > ZK) → `RECONCILE`; dwie FS 300 + 536,59 niemirrorujące nazwami, suma równa → `ORDER_BREAKDOWN`; dwie FS mirrorujące pozycje ZK 1:1 → `MIRROR`; przejście `MIRROR` → `RECONCILE` → `MIRROR` zachowuje poprawne prowizje (brak duplikatów `INSERT INTO commissions` poza dozwolonymi plikami). E2E Playwright jak w Loop 6: admin widzi kartę uzgodnienia, wpisuje kwoty, zapis, karta znika, prowizja pozycji produktu = 10% nowej kwoty (wg stawki architekta), „Zastosuj status” znów dostępne; architekt widzi „Faktury w uzgadnianiu” przed i normalną kartę po.

**Bramka i DoD:** `npm test`, `tsc` (tylko znane TS5097), `npm run build`, e2e, DOWÓD w `docs/subiekt/LOOP5B-DOWOD-<data>.md`, checklist §5. DoD: FS zbiorcza na kwotę równą ZK nie zmienia prowizji względem rozbicia z ZK i nie wymaga kliknięć; FS o innej kwocie blokuje zakończenie projektu do czasu uzgodnienia, które admin wykonuje w jednym formularzu; kolejny sync nie cofa decyzji admina; nowa faktura w łańcuchu przywraca pytanie.

- [x] `reconcile.ts`: `mirrors`, `chainMode`, `fingerprint` (+ `chainTotals`, `sameBreakdownKey`) z testami
- [x] `syncChainOf`: ORDER_ONLY / INVOICE_ONLY / MIRROR / ORDER_BREAKDOWN / RECONCILE, `subiekt_reconciliations` (OPEN / RESOLVED / AUTO_CLOSED), wpisy OPENED / CLOSED tylko przy przejściu
- [x] Blokada: `getSuggestedStatus` (`reason: 'RECONCILE_OPEN'`), `updateProjectStatus(…, 'ZAKOŃCZONY')` → `{ success: false, error }`
- [x] `resolveReconciliationOp` + `resolveReconciliationAction` (ADMIN, STAFF; `{ ok, error }`), wpis RESOLVED z kwotami przed/po
- [x] UI: `ReconciliationCard`, baner z powodem, linia „Faktury uzgodnione ręcznie … · historia”, „Do uzgodnienia (n)”, plakietka „nieprzypisane + uzgodnienia”, „Faktury w uzgadnianiu” u architekta, historia z wpisami `SUBIEKT_RECONCILIATION_*` (architekt — bez kwot)
- [x] Łączenie / przenoszenie / ignorowanie z wierszami uzgodnień; `REMARKS_MARKER` zawężony (§6 pkt 18)
- [x] Migracja 021 + `ensure-production-schema.mjs` + seed; testy z listy; e2e; checklist §5

**DOWÓD (2026-10-30):** `docs/subiekt/LOOP5B-DOWOD-2026-10-30.md` — bramka 395/395, `test:agent` 56/56, tsc 18× TS5097, build OK; e2e na `next start` (4 fazy, wszystkie 4 punkty DoD potwierdzone; 2 asercje skryptu poprawione — opis w dowodzie). Poprawki po przeglądzie 2026-10-31 (`93ab273`, §6 pkt 19 i 22): bramka 399/399, e2e faza 5 14/14. Otwarte do decyzji: §6 pkt 20–21.

---

### Loop 6 — Scenariusz końcowy „dzień z życia” (na czystej bazie dev)

Wykonać w całości przez UI i `curl`/agenta, bez edycji bazy ręcznie. Każdy punkt ma obserwowalny skutek.

1. [x] Admin loguje się, tworzy architekta „Anna Nowak”, nadaje kod `A-001`.
2. [x] Agent (lub `curl`) wysyła ZK 1/10/2026 dla `A-001` z 2 pozycjami: tapeta 10 szt × 100 (karta towaru), montaż 500 (jednorazowa).
3. [x] Admin widzi w pipeline projekt „Jan Testowy — ZK 1/10/2026” w statusie PRZYJĘTY, z pozycjami PRODUCT 1 000 i INSTALLATION 500, prowizja PENDING = 1 000 × stawka. Sidebar „Subiekt” bez badge.
4. [x] Anna loguje się, widzi projekt, kwotę i prowizję „w toku”. Nie widzi przycisków edycji.
5. [x] Agent wysyła ZK 1/10/2026 ze zmianą: tapeta 8 szt. Anna i admin widzą wpis zmiany w logu z treścią „10 → 8 szt”. PENDING = 800 × stawka.
6. [x] Agent wysyła FS 7/10/2026 z rodzicem ZK, 8 szt × 100, niezapłacona. Pozycje projektu: FS 800 (PRODUCT), montaż 500 z FS (INSTALLATION). Baner „Sugerowany status: W_REALIZACJI”. Admin klika „Zastosuj” → status W_REALIZACJI.
7. [x] Agent wysyła tę samą FS z `is_paid: true`. Baner „Sugerowany status: ZAKOŃCZONY”. Admin klika „Zastosuj” → ZAKOŃCZONY; prowizja EARNED = 800 × stawka; cashback 2% = 16 zł w portfelu Anny z datą wygaśnięcia za 12 miesięcy.
8. [x] Agent wysyła KFS do FS: tapeta 8 → 6 szt. Pozycja 600; w `commissions` korekta −200 × stawka; w portfelu korekta cashbacku −4 zł. Anna widzi zmianę w logu.
9. [x] Agent wysyła FS 9/10/2026 bez rodzica i bez kodu. Sidebar „Subiekt” pokazuje badge „1”. Admin w skrzynce widzi powód `NO_ARCHITECT`, klika „Utwórz projekt” dla Anny → nowy projekt z pozycjami z FS.
10. [x] Łączenie projektów (wariant przed krokiem 7): admin łączy projekt z FS 9/10/2026 z projektem z kroku 3, gdy ten jest jeszcze W_REALIZACJI → jeden projekt, oba łańcuchy w sekcji „Dokumenty Subiekt”, suma pozycji i PENDING równa sumie przed połączeniem (sprawdzić zapytaniem przed i po), wiersz `PROJECTS_MERGED` w `activity_logs`. Po kroku 7 (projekt ZAKOŃCZONY) łączenie jest niedozwolone zgodnie z regułą Loopa 4; wtedy faktura-sierota trafia do zakończonego projektu przez „Przypisz” w skrzynce → pozycja z FS w projekcie, prowizja EARNED i cashback naliczone od razu (ścieżka `assignDocumentToProject` na projekcie ZAKOŃCZONY). Oba warianty do wykonania.
11. [x] Restart aplikacji (`npm run dev` ponownie). Wszystko z punktów 3–10 nadal widoczne.
12. [x] Admin loguje się jako STAFF: widzi skrzynkę i może przypisać dokument, ale nie widzi „Połącz” ani „Przenieś” (operacje finansowe tylko ADMIN).

**DOWÓD:** zrzuty ekranu kroków 3, 5, 7, 9, 10; wynik zapytań sum przed/po połączeniu; wynik `node --test tests/*.test.ts`, `npx tsc --noEmit`, `npm run build`.

**DOWÓD (2026-10-30):** `docs/subiekt/LOOP6-DOWOD-2026-10-30.md` — kroki 1–12 zaliczone na czystej bazie; krok 10 w dwóch wariantach (a: łączenie przed krokiem 7 — sumy pozycji/PENDING/dokumentów identyczne, `PROJECTS_MERGED`; b: FS 11/10/2026 „Przypisz” do projektu ZAKOŃCZONY → PRODUCT 400, EARNED 40, cashback +8); poprawki kroku 8 w `bbb6de2`; bramka 303/303, tsc 19× TS5097, build OK.

---

### Loop 7 — Wdrożenie na produkcję

- [ ] Ustawić w Coolify `SUBIEKT_SYNC_TOKEN`, `SUBIEKT_SYNC_SECRET` (wygenerowane `openssl rand -hex 32`, dwa różne).
- [ ] Ustawić w Coolify przy pierwszym wdrożeniu `PORTAL_INTERNAL_MODE=1` (start tylko dla zespołu — Loop 4b) i `CASHBACK_EXPIRY_MONTHS=24`; po wdrożeniu sprawdzić plakietkę „Tryb wewnętrzny” w panelu i odmowę logowania kontem architekta.
- [ ] Merge do `main`, trigger deployu przez API Coolify (zob. pamięć `reference_coolify`), `ensure-production-schema.mjs` dodaje kolumny i tabele przy starcie — sprawdzić w logach startu kontenera komunikaty o dodanych tabelach.
- [ ] Sprawdzić strefę czasową MySQL (`SELECT @@global.time_zone, NOW()`) i procesu Node w kontenerze (`date`, `echo $TZ`); mysql2 czyta DATETIME w czasie lokalnym Node, a `CURRENT_TIMESTAMP` zapisuje czas serwera MySQL — jeśli nie obie UTC, ustawić `TZ=UTC` w Coolify dla aplikacji (najprościej) albo `timezone: 'Z'` w poolu `src/lib/db.ts` + `SET time_zone='+00:00'`. Dotyczy `started_at/finished_at` przebiegów, historii ZK i `expires_at` cashbacku (§6 pkt 11).
- [ ] Sprawdzić kolację bazy produkcyjnej: `SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();` oraz `SHOW CREATE TABLE invitations;`. Nowe tabele Subiekta mają jawnie `utf8mb4_unicode_ci` (ensure-production-schema.mjs), tak jak stare z `deploy/schema.mysql.sql`; przy `utf8mb4_0900_ai_ci` na starych tabelach złączenia padłyby błędem 1267 (sprawdzone na MySQL 8.4 w Dockerze, 2026-10-30).
- [ ] `positions_json` jest `MEDIUMTEXT` (16 MB), `remarks` `VARCHAR(4000)` z walidacją po stronie API; baza nie ma obsługi `DB_PORT` — jeśli MySQL produkcyjny nie słucha na 3306, dopisać w `db.ts`.
- [ ] Smoke test: `curl` z pustą paczką (`documents: []`) → 200, run DONE w panelu. `curl` ze złym tokenem → 401.
- [ ] Nadać kody wszystkim aktywnym architektom w panelu (lista z `/dashboard/admin/architects`).
- [ ] Po wdrożeniu kliknąć „Nadaj brakujące kody” na liście architektów (Loop 4b; przycisk widzi tylko ADMIN, znika, gdy wszyscy mają kod) i sprawdzić kolumnę „Kod”.
- [ ] Import CSV w trybie wewnętrznym zakłada konta architektów z kodem, ale pomija mail powitalny z hasłem tymczasowym (`[internal-mode] pominięto mail ARCHITECT_REGISTERED …` w logu). Onboarding tych architektów idzie później, przy otwarciu portalu, mailem „ustaw hasło” (zob. pamięć „Mail startowy do architektów”).
- [ ] Na PC z bazą: `.env` agenta z adresem `https://archi.walldecor.pl`, `npm run sync -- --dry-run`, przegląd pliku, potem `npm run sync`. Przegląd skrzynki nieprzypisanych i ręczne przypisanie historycznych dokumentów.
- [ ] Po pierwszym pełnym imporcie: porównać dla 3 architektów sumę pozycji SUBIEKT w portalu z sumą netto ich FS w GT (raport w GT filtrowany po polu własnym). Różnice wyjaśnić przed ogłoszeniem architektom.
- [ ] Aktualizacja `PROGRESS.md` (max 10 punktów) i `CLAUDE.md` (sekcja „Current task”).

---

## 5. Checklist audytu atrap (przed oznaczeniem KAŻDEGO loopa jako done)

- [ ] Kliknąłem każdy widoczny element dodany w loopie. Każdy coś robi albo go nie ma.
- [ ] Spróbowałem EDYTOWAĆ to, co utworzyłem (kod architekta, przypisanie, typ pozycji). Zmiana jest w bazie, nie tylko na ekranie.
- [ ] Zrestartowałem aplikację. Dane są.
- [ ] Wysłałem tę samą paczkę dwa razy. Liczba dokumentów, pozycji, prowizji nie wzrosła.
- [ ] Zalogowałem się jako architekt A i sprawdziłem, że nie widzę projektów ani dokumentów architekta B.
- [ ] Zalogowałem się jako STAFF i sprawdziłem, że operacje finansowe (połącz, przenieś, typ pozycji) są niedostępne.
- [ ] `grep -rn "INSERT INTO commissions" src/ --include=*.ts` wskazuje wyłącznie `src/lib/projectItems.ts`, `src/app/actions/import.ts` oraz `updateProjectStatus` w `src/app/actions/projects.ts`.
- [ ] Raport loopa zawiera komendy, wyniki, zrzuty.

---

## 6. Otwarte pytania do rozstrzygnięcia w trakcie (nie blokują startu loopów 0–4)

1. Wartości `dok_Typ` i kolumna powiązania dokumentów w GT (weryfikacja w biurze, wejście do loopa 5).
2. Czy pole własne dokumentu w GT jest słownikowe, czy tekstowe. Jeśli tekstowe, format `A-001` trzeba pilnować ręcznie; portal i tak dopasowuje po kodzie przed pierwszą spacją (`"A-001 Nowak"` → `A-001`).
3. Historyczne projekty wpisane ręcznie, dla których teraz przyjdzie ZK z Subiekta: powstanie drugi projekt. Admin łączy je przez „Połącz z projektem…”, ale pozycje MANUAL i SUBIEKT będą wtedy liczone podwójnie. Decyzja na później: po połączeniu admin ręcznie usuwa pozycje MANUAL (dozwolone) albo wprowadzamy przy łączeniu opcję „usuń pozycje ręczne projektu źródłowego”. Do zdecydowania w loopie 4 po zobaczeniu skali.
4. Faktury zaliczkowe (FZal) i końcowe: poza zakresem v1. Jeśli występują u architektów, agent wysyła je jako `FS` z pełną kwotą końcową, a zaliczkowe pomija. Potwierdzić z księgowością przed loopem 5.
5. (Loop 4A) ZK, która przyjdzie po ręcznym przypisaniu FS bez korzenia, tworzy własny łańcuch — pozycje ZK mogą liczyć się obok pozycji tej FS. Sprawdzić w scenariuszu loopa 6.
6. (Loop 4A) Zmiana typu pozycji na PRZYJĘTY / W_REALIZACJI zakłada PENDING według bieżącej stawki architekta (`addItemCore`), nie stawki dotychczasowej PENDING. Zaakceptowane.
7. (Loop 4A) „Zastosuj status” przechodzi krokami przez `updateProjectStatus` i nie jest jedną transakcją — błąd w trakcie zostawia projekt na ostatnim udanym (poprawnym) kroku. Zaakceptowane.
8. (Loop 4A) Operacje admina nie zakładają blokad wierszy (`SELECT … FOR UPDATE`). Na MySQL operacja admina równoległa z synchronizacją tego samego łańcucha może się przeplatać; ryzyko akceptowane, bo sync idzie wieczorem, a admin pracuje w dzień. Do ponownej oceny, jeśli sync zacznie chodzić częściej.
9. (Loop 6) `PROJECTS_MERGED` (i inne wpisy `activity_logs` poza historią dokumentów projektu) nie ma widoku w UI — globalny feed admina usunięty w 703bcbb, `getAdminActivity` nieużywany. Zdecydować, czy feed wraca.
10. (Loop 6) KFS w dół obniża „zafakturowane” (FS + KFS) poniżej ZK: zapłacony projekt dostaje sugestię `W_REALIZACJI` (na ZAKOŃCZONY baner ukryty), a karta pokazuje „do zafakturowania” = kwota korekty. Do decyzji: porównywać ZK z samą FS albo traktować KFS osobno.
11. (Loop 6) Cashback `expires_at` zapisywany w czasie lokalnym procesu (`formatSqlDateTime`), `created_at` w UTC (SQLite/MySQL) — na dev przesunięcie 1 h. Sprawdzić przy strefie czasowej w Loopie 7.
12. (Loop 6, istniejące wcześniej) Strona projektu architekta pokazuje „Wypłać środki” poniżej progu wypłaty 100 PLN (portfel poprawnie blokuje wypłatę).
13. **Podtypy FS (2026-10-30).** W bazie są FS o `dok_Podtyp` 0, 1, 3, 4, 5; znaczenie nieznane (podejrzenie: faktury zaliczkowe i końcowe). Agent wysyła wszystkie podtypy, portal liczy je jednakowo, więc faktura zaliczkowa + końcowa może podwoić sprzedaż projektu. Do ustalenia po `--probe` (przykłady każdego podtypu): które podtypy pominąć lub jak je łączyć.
14. **FS z wielu dokumentów (`dok_DoDokNrPelny = '+'`).** Heurystyka agenta (jeden kandydat ZK tego samego płatnika) jest przybliżeniem; do potwierdzenia na dry-runie, czy GT ma tabelę powiązań wielu źródeł, którą można czytać zamiast heurystyki.
15. **Pozycje KFS (Loop 5, hipoteza do sprawdzenia sondą).** Agent pomija na KFS wiersze `ob_Znak = −1` (zakładany stan „przed korektą”) i wysyła wiersze po korekcie, zgodnie z konwencją portalu (pozycja KFS = stan po korekcie, `net_total` dokumentu = różnica). Struktura KFS w bazie biura nie była w raporcie 30.10.2026 — sekcja sondy „Pozycje najnowszej KFS …” pokazuje `ob_Znak`/`ob_DoId`; jeśli wiersze nie mają par −1/1, trzeba zmienić `payload.ts`.
16. **FS '+' bez jednoznacznego ZK (Loop 5, po przeglądzie jakości).** Heurystyka liczy się na całej historii płatnika (ZK architektów i ich FS/WZ bez limitu daty; starsze FS '+' też „zajmują” swoje ZK), więc wynik nie zależy od początku okna. Do ręcznej obsługi (lista w podsumowaniu, kod wyjścia 4) idą FS '+', których płatnik ma ZK architekta, ale kandydatów jest 0 lub ≥ 2; FS '+' płatników bez żadnego ZK architekta jest tylko liczona jako zwykła sprzedaż. Do potwierdzenia na dry-runie.
17. **Statusy dokumentów GT (Loop 5).** Agent nie filtruje po `dok_Status` (np. dokumenty anulowane / odłożone) — znaczenia wartości nie zweryfikowano. Sonda pokazuje liczność ZK i FS ze zbioru wg `dok_Status`; na tej podstawie zdecydować o filtrze.
18. **[Rozstrzygnięte w Loop 5b — portal zawężony do `#A` + 1–6 cyfr jak agent.]** **Znacznik w Uwagach: agent węższy niż portal (Loop 5, po przeglądzie jakości).** Agent uznaje za korzeń tylko `#A` + 1–6 cyfr (`/#A[-_]?\d{1,6}(?![A-Za-z0-9])/i`), portal czyta kod szerszym `/#A[-_]?([A-Za-z0-9]{1,16})/i` i bierze pierwsze trafienie — Uwagi „#Adam … #A-0002” dadzą w portalu kod „A-DAM” (dokument w skrzynce „nieznany kod”). Do decyzji: zawęzić wzorzec w portalu.
19. **[Rozstrzygnięte 2026-10-31 — `mirrors` porównuje pozycje FS przed KFS; łańcuch z rozbiciem ZK zostaje MIRROR, korekta trafia w pozycję FS (`93ab273`, dowód: `docs/subiekt/LOOP5B-DOWOD-2026-10-30.md`, faza 5).]** (Loop 5b) KFS w łańcuchu ZK otwierał uzgodnienie, bo `mirrors` porównywał pozycje FS po korekcie.
20. **(Loop 5b) Faktura częściowa** otwiera uzgodnienie, które zamyka się samo przy kolejnej FS (wpisy OPENED + CLOSED w historii). Do decyzji, czy np. wstrzymywać otwarcie, dopóki FS < ZK i nie wszystkie zapłacone.
21. **(Loop 5b) Kwoty faktur u architekta.** Wpisy uzgodnienia ich nie pokazują, ale istniejący wpis `SUBIEKT_CORRECTION` (Loop 6, D1) pokazuje architektowi numer FS i ceny przed/po korekcie KFS.
22. **[Rozstrzygnięte 2026-10-31 — `93ab273`.]** (Loop 5b) Pozycja uzgodniona na 0 znikała (projekt w toku) i po ponownym otwarciu uzgodnienia nie wracała do formularza. Teraz przy ponownym otwarciu RESOLVED kwoty 0 są zdejmowane z decyzji, pozycja wraca z kwotą z ZK.
