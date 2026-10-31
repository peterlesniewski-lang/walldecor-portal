# Loop 5b — uzgodnienie faktur z zamówieniem — DOWÓD (2026-10-30)

Plan: `PLAN-SUBIEKT-2026-10-29.md`, sekcja „Loop 5b”. Gałąź `subiekt/loop-5b-reconcile` (od `c741ca8`).

**Wynik:** zakres z planu zrobiony. Bramka zielona, e2e: 4 fazy, 49 sprawdzeń. Dwie asercje skryptu e2e były źle napisane (F11, J1, opis niżej) — produkt działał poprawnie, skrypt poprawiony. DoD spełniony; uwagi w sekcji „Konsekwencje i otwarte kwestie”.

## Bramka

```
npm test              → ℹ tests 395 · pass 395 · fail 0     (było 353; +42)
npm run test:agent    → ℹ tests 56 · pass 56 · fail 0
npx tsc --noEmit      → 18 × error TS5097, 0 innych
npm run build         → exit 0 (Compiled successfully, wszystkie trasy)
grep -rn "INSERT INTO commissions" src/ --include='*.ts'
  → src/app/actions/projects.ts:237, :310 (updateProjectStatus), src/app/actions/import.ts:220,
    src/lib/projectItems.ts:127, :159, :246, :257   — bez nowych miejsc
```

Nowe testy (+42): `tests/subiektReconcile.test.ts` (9, czyste reguły), `tests/subiektReconcileSync.test.ts` (20, SQLite: tryby, blokada, resolve, merge/move/ignore, akcja, widoki), `tests/subiektReconcileUi.test.ts` (9, źródła UI + pomocniki formularza), 2 testy znacznika w `tests/subiektMapping.test.ts`, test 8b w `subiektMappingSync` i rozdzielony test ignorowania w `subiektAdminOps`. Istniejące testy zaktualizowane do nowych reguł (opis w „Decyzje”, pkt 12).

## Co zrobiono (commity)

| Commit | Zakres |
|---|---|
| `4c73d70` | `src/lib/subiekt/reconcile.ts`: `mirrors`, `sameBreakdownKey`, `chainTotals`, `chainMode`, `fingerprint` |
| `50bacea` | `REMARKS_MARKER` = `/#A[-_]?(\d{1,6})(?![A-Za-z0-9])/i` jak w agencie; „#Adam” nie daje kodu (zamyka §6 pkt 18) |
| `20cef84` | Migracja `021_subiekt_reconciliations.sql`, `ensure-production-schema.mjs` (`createSql` z `ENGINE=InnoDB … utf8mb4_unicode_ci`, `UNIQUE KEY (project_id, root_external_id)`, indeks `status`), blok SCHEMA w `seed-dev.mjs` |
| `bac422a` | `syncChainOf` z trybami, `subiekt_reconciliations`, blokada w `getSuggestedStatus` / `updateProjectStatus`, `resolveReconciliationOp` + `resolveReconciliationAction`, merge/move/ignore |
| `f9b1903` | WIP (punkt kontrolny na prośbę koordynatora): czerwone testy widoków |
| `c584f74` | `getOpenReconciliations`, `getOpenReconciliationCount`, `getProjectReconciliations`, `getProjectZkChanges(projectId, audience)` |
| `0582b98` | UI: `ReconciliationCard`, powód w banerze, linia w dokumentach, sekcja „Do uzgodnienia (n)”, plakietka, widok architekta, obsługa `{ success: false }` w UI zmiany statusu |

## E2E (Playwright headless Chromium, `next start -p 3605` z buildu produkcyjnego)

Środowisko: czysta baza `DB_PATH=<scratchpad>/e2e/e2e.sqlite node scripts/seed-dev.mjs` (dev.sqlite nietknięty), `DB_TYPE=sqlite`, `SUBIEKT_SYNC_TOKEN/SECRET`, `NEXTAUTH_*`. Paczki wysyłane `send.mjs` (HMAC-SHA256 z `${ts}.${body}` jak `auth.ts`). Zmiany danych tylko przez API i UI; `sqlite3` tylko do odczytu. Architekt: Kamila (`kamila@dev.local`), w seedzie obrót kwalifikowany 29 800 → Partner 10 %.

Paczki: ZK 71/10 (`7101`: Tapeta Floral 536,59, karta 77 + Montaż 300 jednorazowy) + FS 72/10 (`7102`, jedna pozycja „Usługa” 836,59, zapłacona) — **równe sumy**; ZK 81/10 (`7201`, te same pozycje) + FS 82/10 (`7202`, „Usługa” 900,00) — **niezgodne**; potem FS 82/10 zapłacona; KFS 83/10 (`7203`, −100 do pozycji FS).

**Faza 1** — admin, lista architektów → „Edytuj dane: Kamila Wiśniewska” → Kod w Subiekcie `A-001` → zapis. `users.subiekt_code = A-001`. (Pierwsze podejście wysłało paczki przed nadaniem kodu → baza zasiana od nowa, żeby kolejność odpowiadała praktyce.)

**Wysyłki** (każda paczka 2×, druga `unchanged`):
```
p1-zk7101 → 200 {"accepted":1,"unchanged":0,"rejected":[],"unassigned":0}   (2×: unchanged 1)
p2-fs7102-equal-paid → 200 {"accepted":1,…}   (2×: unchanged 1)
p3-zk7201 → 200 {"accepted":1,…}             (2×: unchanged 1)
p4-fs7202-900 → 200 {"accepted":1,…}         (2×: unchanged 1)
```
Stan po wysyłkach: pozycje obu projektów **z ZK** (536,59 PRODUCT + 300 INSTALLATION), `invoice_number` = numer FS, `order_number` = ZK, `is_paid` 1 tylko w projekcie z zapłaconą FS; PENDING 53,659 (10 %) w obu; `subiekt_reconciliations`: jeden wiersz `p_06d1cf2e 7201 OPEN 836.59 900.0 '7202:900.00'`; jeden `SUBIEKT_RECONCILIATION_OPENED` (user NULL).

**Faza 2 — 18/18 PASS** (`02a`, `03`, `04a`, `04b`, `05`)
- A1–A4 równe sumy: brak karty, pozycje z ZK, baner „Zakończony” → „Zastosuj” → ZAKOŃCZONY **bez uzgadniania** (DoD 1).
- B1–B4 integracja: „Do uzgodnienia (1)” z Kamilą, ZK 81/10, 836,59 / 900,00 / 63,41; plakietka `title="Subiekt: nieprzypisane dokumenty 0 + uzgodnienia faktur 1"`, licznik 1; link prowadzi do projektu.
- C1–C6 projekt: karta nad pozycjami (kwota ZK, faktur, różnica, „FS 82/10/2026 · 28.10.2026 · 900,00 PLN”), baner „Najpierw uzgodnij faktury z zamówieniem”; „Zastosuj” W realizacji działa; „Zakończ projekt” → komunikat „Projekt ma nieuzgodnione faktury z Subiekta. Uzgodnij je przed zakończeniem.”, status bez zmian (DoD 2).
- D1–D3 architekt: „Faktury w uzgadnianiu”, brak 900 / 63,41 / numeru FS, wpis „ZK 81/10/2026: faktury w uzgadnianiu z zamówieniem…”. Konsola bez błędów.

**Faza 3 — 16 sprawdzeń, 15 PASS + F11 (błąd asercji)** (`06a`, `06b`, `06c`, `07`). Przed fazą: FS 82/10 zapłacona (`unchanged 1` ×2).
- F1 zapłacona FS + OPEN: brak podpowiedzi „Zakończony”, jest powód blokady.
- F2–F4 przycisk „Zapisz uzgodnienie” nieaktywny przy 836,59; po wpisaniu 500 suma „800,00 PLN”, „do rozłożenia: 100,00 PLN”; po 600 „zgodna z kwotą faktur”, przycisk aktywny (jeden formularz — DoD 2).
- F5–F10 po zapisie karta znika, produkt 600, prowizja planowana 60 (10 % × 600), baner znów „Zakończony” z „Zastosuj”, linia „Faktury uzgodnione ręcznie 30.10.2026 przez Anna Nowak · historia” → `#zmiany-subiekt`, wpis „Tapeta Floral 536,59 → 600,00 zł; Montaż 300,00 zł bez zmian; razem 900,00 zł. Notatka: …”.
- **F11**: „Zastosuj” → ZAKOŃCZONY, **prowizja zarobiona 72** (nie 60, jak zakładał skrypt). Przyczyna: krok A4 zakończył projekt 536,59 → obrót Kamili 29 800 + 536,59 > 30 000 → przy finalizacji stawka 12 % (`getCommissionRateForTurnover`, obrót sprzed projektu) → 12 % × 600 = 72. Zachowanie poprawne, asercja w skrypcie poprawiona (`phase3.mjs`). W bazie: `EARNED 72.0 rate 0.12 „Subiekt: uzgodnienie faktur ZK 81/10/2026”`.
- G1–G4 architekt po: bez „Faktury w uzgadnianiu”, wpis „faktury uzgodnione z zamówieniem, kwoty pozycji zaktualizowane.”, autor „WallDecor” (bez nazwiska admina i notatki), pozycja 600, prowizja 72.

**Idempotencja i nowa faktura** (`evidence/sends-3-idempotency-kfs.txt`):
```
przed:               docs 4 items 4 commissions 8 wallet 6 reconciliations 1 rec_logs 2
p1, p2, p3, p5 ponownie → unchanged 1 (×4)
po ponownej wysyłce: docs 4 items 4 commissions 8 wallet 6 reconciliations 1 rec_logs 2   — kwoty 600 / 300 bez zmian (DoD 3)
p6-kfs7203 → 200 accepted 1; ponownie unchanged 1
po KFS:              docs 5 items 4 commissions 8 wallet 6 reconciliations 1 rec_logs 3
  subiekt_reconciliations: OPEN, invoiced 800.0, fingerprint '7202:900.00;7203:-100.00', amounts_json {"72011":600,"72012":300}   (DoD 4)
```

**Restart:** `pkill` serwera (curl → 000), `next start` ponownie; `state.sh` przed i po — `diff` pusty („stan bazy identyczny po restarcie”).

**Faza 4 (po restarcie) — 14 sprawdzeń, 13 PASS + J1 (błąd asercji)** (`08`, `09`, `10a`, `10b`)
- I1–I6 admin: karta wróciła po KFS, kwota faktur 800,00, „KFS 83/10/2026 · 29.10.2026”, pola wypełnione poprzednią decyzją `600,00 / 300,00`, pozycje nadal 600 / 300, projekt zakończony — bez banera; integracja „Do uzgodnienia (1)”.
- **J1**: architekt widzi „Faktury w uzgadnianiu” i neutralne wpisy uzgodnienia, ale asercja „brak tekstu »KFS 83« i »800,00«” nie przeszła, bo karta historii pokazuje istniejący od Loopu 6 (D1) wpis `SUBIEKT_CORRECTION`: „KFS 83/10/2026 (korekta FS 82/10/2026): Usługa cena 900,00 → 800,00 zł; wartość korekty -100,00 zł” (zrzut `09`). Wpisy uzgodnienia kwot nie pokazują; asercja zawężona do treści uzgodnienia. Zob. „Konsekwencje”, pkt 3.
- K1–K3 STAFF (`zespol@dev.local`): wpisuje 500 / 300, zapis, karta znika, produkt 500, linia „Faktury uzgodnione ręcznie … przez Tomasz Zieliński” (STAFF z seeda); na stronie nie ma „Połącz projekty”, „Przenieś do”, „Zmień na …”. Prowizje: `EARNED 72.0`, `EARNED -12.0` (korekta 12 % × −100 przez `updateItemAmountCore`), `RESOLVED`, `resolved_by u_staff`.
- L1–L3 Marcin (inny architekt): projekty Kamili → 404 / 404, lista bez „Jan Testowy”, strona integracji bez danych.
- Konsola bez błędów we wszystkich fazach.

Zrzuty i pliki dowodów (scratchpad sesji, poza repo): `…/scratchpad/e2e/shots/01…10b-*.png`, `…/e2e/evidence/{sends-1,sends-2,sends-3-idempotency-kfs,phase2,phase3,phase4,restart}.txt`, `state-*.txt`; skrypty `phase1–4.mjs`, `send.mjs`, `state.sh`.

## Checklist audytu atrap (§5)

- [x] Kliknięte wszystkie nowe elementy: pola kwot, notatka, „Zapisz uzgodnienie” (nieaktywny/aktywny), link projektu w „Do uzgodnienia”, „historia”; baner z powodem nie ma przycisku (tylko informacja).
- [x] Edycja tego, co utworzone: STAFF zmienił decyzję admina (600 → 500) — w bazie `amounts_json {"72011":500,…}`, korekta prowizji −12.
- [x] Restart — stan identyczny (`diff` pusty), karta i sekcja po restarcie.
- [x] Ta sama paczka dwa razy — liczności dokumentów / pozycji / prowizji / portfela / uzgodnień / wpisów bez zmian.
- [x] Architekt B nie widzi projektów architekta A (404).
- [x] STAFF bez „Połącz / Przenieś / Zmień typ”; uzgodnienie dostępne dla ADMIN i STAFF zgodnie z planem.
- [x] `INSERT INTO commissions` tylko w dozwolonych plikach.
- [x] Raport z komendami, wynikami i zrzutami.

## Decyzje tam, gdzie plan milczy

1. **ORDER_ONLY / INVOICE_ONLY** też zamykają OPEN/RESOLVED (`AUTO_CLOSED`), nie tylko MIRROR i ORDER_BREAKDOWN — inaczej np. zignorowana FS zostawiałaby projekt zablokowany na zawsze. Wpis `SUBIEKT_RECONCILIATION_CLOSED` tylko przy zamknięciu OPEN.
2. **RESOLVED, a zmieniły się pozycje ZK** (nowa / usunięta pozycja; odcisk faktur ten sam) → OPEN, bo decyzja nie pokrywa rozbicia; znane pozycje zachowują kwoty admina, nowe biorą kwotę z ZK. `amounts_json` zawiera wszystkie pozycje ZK > 0 (pozycja bez wiersza = 0).
3. **Ponowne otwarcie z AUTO_CLOSED** czyści `amounts_json` i notatkę (pozycje wróciły do ZK); z RESOLVED zachowuje je (plan: kwoty zostają do nowej decyzji).
4. **Zapłata pozycji z ZK** (`is_paid` = wszystkie FS łańcucha): FS z wynikiem `UNCHANGED` (zapłata poza hashem) przechodzi teraz przez `syncChainOf` (idempotentne), żeby odświeżyć znacznik na pozycjach ZK.
5. **`updateProjectStatus`** zwraca `{ success: false, error }` (typ `ProjectStatusResult`); `Unauthorized` i pozostałe walidacje nadal rzucane. UI (karta statusu, pipeline, lista) i `applySuggestedStatus` obsługują `success: false`.
6. **Powód `RECONCILE_OPEN`** jest zwracany przy każdym OPEN (nie tylko gdy zablokował ZAKOŃCZONY); baner z samym powodem pokazujemy także, gdy podpowiedź = bieżący status (projekt nie ZAKOŃCZONY / NIEZREALIZOWANY).
7. **Łączenie projektów**: wiersze uzgodnień źródeł → cel. Ten sam łańcuch w kilku projektach (rzadkie) → zostaje jeden wiersz (najwcześniej otwarty ze źródeł) i łańcuch jest przeliczany w celu. **Przeniesienie łańcucha** przenosi wiersz; projekt, który stracił łańcuch, jest sprzątany (`resyncProjectInvoices` → `AUTO_CLOSED`).
8. **Lista i licznik „Do uzgodnienia”** pomijają projekty NIEZREALIZOWANY (blokada w samym projekcie zostaje).
9. **Historia dla architekta**: `getProjectZkChanges(id, 'ARCHITECT')` — wpisy uzgodnienia neutralne (bez kwot, numerów faktur i notatki), autor-admin jako „WallDecor”; admin widzi pełną treść i nazwisko.
10. **Odcisk** dłuższy niż 2000 znaków → `sha256:<hex>`; kwoty w odcisku z 2 miejscami (`900.00`).
11. **Przycisk zapisu** w karcie jest `secondary` (konwencja strony: jeden przycisk primary).
12. Testy mechaniki korekt KFS z Loopów 2–4 przeszły na łańcuch z korzeniem **FP** (INVOICE_ONLY). Po poprawce z 2026-10-31 (niżej) to nie jest już wymagane, ale testy zostają na FP (pokrywają ścieżkę INVOICE_ONLY); test 8 (`subiektMappingSync`) wrócił do zachowania z Loopu 6 (korekta na pozycji FS), 8b pokrywa wariant FP.

## Konsekwencje i otwarte kwestie (do decyzji użytkownika)

1. ~~**KFS w łańcuchu ZK zawsze otwiera uzgodnienie.**~~ **Rozstrzygnięte 2026-10-31** (`93ab273`, §6 pkt 19) — zob. „Poprawki po przeglądzie”.
2. **Faktura częściowa** (np. najpierw sam produkt) otwiera uzgodnienie, które zamyka się samo przy kolejnej FS (MIRROR / równe sumy). W historii zostają wpisy OPENED + CLOSED; admin może też uzgodnić „za wcześnie” — kolejna FS i tak zmieni odcisk.
3. **Kwoty faktur u architekta**: wpisy uzgodnienia ich nie pokazują, ale istniejący od Loopu 6 wpis `SUBIEKT_CORRECTION` pokazuje architektowi numer FS i ceny przed/po korekcie (zrzut `09`). Jeśli to ma zniknąć, trzeba zmienić decyzję z Loopu 6 (krok 8: „Anna widzi zmianę w logu”).
4. ~~Pozycja wyzerowana decyzją admina nie wracała przy ponownym otwarciu.~~ **Rozstrzygnięte 2026-10-31** (`93ab273`, §6 pkt 22) — zob. „Poprawki po przeglądzie”.

## Poprawki po przeglądzie (2026-10-31, commit `93ab273`)

Decyzja koordynatora: punkty 1 i 4 z „Konsekwencji” poprawione w kodzie; punkty 2 i 3 zostają jako otwarte (§6 pkt 20–21).

1. **Mirror przed KFS.** `mirrors(zkPositions, fsPositions)` dostaje pozycje FS tak, jak są na fakturze (`describeChain` w `mappingDb.ts` nie stosuje już mapy korekt). Łańcuch, którego faktury powtarzają rozbicie ZK, zostaje MIRROR także po KFS — korekta trafia w pozycję FS jak przed Loop 5b. Bez odzwierciedlenia obowiązuje reguła sum z KFS (`invoicedNet` = FS + KFS), a odcisk nadal zawiera KFS, więc nowa korekta przywraca pytanie.
2. **Pozycja uzgodniona na 0 wraca.** Przy ponownym otwarciu RESOLVED (`settleReconciliation`) kwoty 0 są zdejmowane z `amounts_json`; pozycja wraca z kwotą z ZK przez istniejący `syncDocumentItems` → `addItemCore` (w ZAKOŃCZONY: korekta zerowego wiersza w górę przez `updateItemAmountCore`) i jest w formularzu. Notatka poprzedniej decyzji zostaje do nowego zapisu.

Testy (TDD — czerwone przed zmianą, zielone po): `subiektReconcile` (chainMode: KFS na łańcuchu z rozbiciem → MIRROR, na łańcuchu zbiorczym → RECONCILE), `subiektReconcileSync` (+4: KFS w dół na łańcuchu MIRROR w projekcie ZAKOŃCZONY — pozycja FS 436,59, prowizja −100 × stawka, bez uzgodnienia; KFS na łańcuchu ORDER_BREAKDOWN → odcisk `1410:836.59;1420:-100.00`, OPEN; ponowne otwarcie po KFS przywraca montaż 300 i `amounts_json` bez zer, kolejny sync go nie usuwa, nowa decyzja 550 + 300; ponowne otwarcie po zmianie ZK w projekcie ZAKOŃCZONY przywraca montaż). Test 8 w `subiektMappingSync` z powrotem: FS 1000 → 800, korekta EARNED −200 × stawka, brak wiersza uzgodnienia. Test „MIRROR → RECONCILE → MIRROR (ZAKOŃCZONY)” porównuje saldo portfela przed i po (wcześniej sumował wszystkie transakcje architekta B, co psuły nowe testy).

### Bramka po poprawkach

```
npm test              → ℹ tests 399 · pass 399 · fail 0
npm run test:agent    → ℹ tests 56 · pass 56 · fail 0
npx tsc --noEmit      → 18 × error TS5097, 0 innych
npm run build         → exit 0 (✓ Compiled successfully)
```

### E2E faza 5 (nowa czysta baza `e2e2.sqlite`, `next start -p 3605`, build z `93ab273`) — 14/14 PASS

Kod `A-001` dla Kamili nadany w UI (faza 1). Paczki (każda 2×, druga `unchanged 1`): ZK 91/10 (`7301`: Tapeta Test 8 × 100, karta 77; Montaż 500) + FS 92/10 (`7302`, to samo rozbicie, zapłacona); ZK 101/10 (`7401`: Tapeta Floral 536,59 + Montaż 300) + FS 102/10 (`7402`, „Usługa” 900). W trakcie: KFS 93/10 (`7303`: tapeta 8 → 6 szt, −200) i KFS 103/10 (`7403`: usługa 900 → 850, −50).

| # | Sprawdzenie | Wynik |
|---|---|---|
| S1–S2 | Loop 6 krok 8: FS z rozbiciem ZK → pozycje z FS, brak karty, „Zastosuj” → ZAKOŃCZONY, EARNED 80 (10 % × 800) | PASS |
| S3 | Po KFS: brak karty i brak wiersza `subiekt_reconciliations` dla projektu | PASS |
| S4 | Pozycje: `600.0@FS 500.0@FS` (tapeta skorygowana na pozycji FS, pozycje ZK nie wracają) | PASS |
| S5 | Prowizja EARNED 80 − 20 = 60, w UI „Prowizja zarobiona 60” | PASS |
| S6 | Historia: „KFS 93/10/2026 (korekta FS 92/10/2026): Tapeta Test 8 → 6 szt; wartość korekty -200,00 zł” | PASS |
| S7 | Architekt: bez „Faktury w uzgadnianiu”, pozycja 600 | PASS |
| T1–T2 | Karta z 2 pozycjami; zapis 900 + 0 → karta znika, montaż usunięty (pozycje: `900.0`) | PASS |
| T3 | Po KFS 103/10 karta wraca z **obiema** pozycjami: pola `900,00` (decyzja) i `300,00` (kwota z ZK) | PASS |
| T4 | Kwota faktur 850,00; montaż znów w pozycjach projektu (`900.0 300.0`) | PASS |
| T5 | Nowa decyzja 550 + 300 → RESOLVED, pozycje `550.0 300.0` | PASS |
| T6 | Ponowna wysyłka ZK, FS, KFS (`unchanged 1` ×3) nie cofa decyzji | PASS |
| U | Konsola przeglądarki bez błędów | PASS |

Stan końcowy: `p_77c8e59e 7401 RESOLVED 836.59 850.0 '7402:900.00;7403:-50.00' {"74011":550,"74012":300} u_admin`; wpisy: OPENED (900) → RESOLVED „Montaż 300,00 → 0,00 zł” → OPENED (850, z KFS) → RESOLVED „Tapeta Floral 900,00 → 550,00 zł; Montaż 300,00 zł bez zmian”. Projekt Loop 6 krok 8 (`p_50e7b690`) — ZAKOŃCZONY, bez wiersza uzgodnienia.

Zrzuty: `…/scratchpad/e2e/shots2/11-loop6-step8-admin.png`, `12-loop6-step8-architect.png`, `13-resolved-900-0.png`, `14-reopened-both-positions.png`, `15-resolved-550-300.png`; wyniki: `…/e2e/evidence2/{sends-1,phase5,state-final}.txt`, skrypt `phase5.mjs`.

Faz 2–4 nie powtarzano: scenariusz łańcucha zbiorczego (ORDER_BREAKDOWN / RECONCILE / RESOLVED / KFS → OPEN) nie zmienił zachowania (łańcuch bez odzwierciedlenia — reguła sum jak wcześniej), co potwierdzają niezmienione testy i T1–T6.

