# Agent Subiekt GT → Portal Architekta

Program działa na komputerze **SERWER** (ten, na którym jest baza Subiekta GT). Raz dziennie o 20:00 czyta z bazy
**tylko** dokumenty architektów (ZK z kategorią „Architekt” albo ze znacznikiem `#A-…` w Uwagach) oraz dokumenty z nich
wystawione (WZ, FS, KFS) i wysyła je do portalu. Zwykła sprzedaż nie opuszcza biura.

Agent **niczego nie zapisuje w Subiekcie**: łączy się loginem `portal_reader`, który ma wyłącznie prawo odczytu
(`db_datareader` + zakaz INSERT / UPDATE / DELETE / EXECUTE).

Poniższe kroki wykonuje się raz. Wpisuj polecenia dokładnie tak, jak są podane (w ramkach).

---

## 1. Instalacja Node.js 22 LTS

1. Wejdź na <https://nodejs.org/en/download> i pobierz **Node.js 22 (LTS)** → **Windows Installer (.msi)**, wersja 64-bit.
2. Uruchom pobrany plik `.msi`, klikaj „Next” (ustawienia domyślne), na końcu „Finish”.
3. Otwórz **nowe** okno wiersza poleceń: klawisz Windows → wpisz `cmd` → Enter. Wpisz:

   ```
   node -v
   ```

   Ma się pokazać `v22.` i dalsze cyfry. Jeśli pojawia się „nie jest rozpoznawane jako polecenie”, zamknij okno,
   otwórz nowe i spróbuj jeszcze raz (a w razie potrzeby uruchom komputer ponownie).

## 2. Skopiowanie agenta

1. Skopiuj cały katalog `agent-subiekt` (z plikami `package.json`, `package-lock.json`, `tsconfig.json`, katalogiem
   `src` i skryptami `.ps1`) do `C:\PortalArchi\agent-subiekt`.
2. W oknie `cmd`:

   ```
   cd C:\PortalArchi\agent-subiekt
   npm ci
   npm run build
   ```

   `npm ci` pobiera biblioteki (potrzebny internet, ok. 1 minuty). `npm run build` tworzy katalog `dist`.
   Oba polecenia mają się zakończyć bez słowa `ERR!`.

## 3. Plik konfiguracji `.env`

1. W katalogu `C:\PortalArchi\agent-subiekt` skopiuj plik `.env.example` i nazwij kopię `.env`
   (w Eksploratorze: włącz „Widok → Rozszerzenia nazw plików”, żeby nazwa nie zamieniła się w `.env.txt`).
2. Otwórz `.env` w Notatniku i uzupełnij:
   - `SUBIEKT_DB_PASSWORD=` — hasło loginu SQL `portal_reader`,
   - `PORTAL_URL=`, `SUBIEKT_SYNC_TOKEN=`, `SUBIEKT_SYNC_SECRET=` — wartości przekaże administrator portalu
     (do kroków 4 i 5 nie są potrzebne, można je zostawić puste).

   Jeśli hasło zawiera `#` albo spację, ujmij je w cudzysłów: `SUBIEKT_DB_PASSWORD="ab#cd ef"`.
3. Zapisz plik. **Nie wysyłaj nikomu pliku `.env`** — zawiera hasła.

## 4. Sprawdzenie bazy (sonda)

```
cd C:\PortalArchi\agent-subiekt
node dist\main.js --probe
```

Sonda łączy się z bazą, sprawdza, czy istnieją wszystkie tabele i kolumny, z których agent korzysta, i pokazuje
przykłady dokumentów. Na końcu wypisuje `WYNIK: OK (kod 0)` albo `WYNIK: BŁĄD …` z listą brakujących kolumn
i podpowiedziami nazw. Raport zapisuje się w `logs\probe-RRRR-MM-DD.txt` — **odeślij ten plik**.

## 5. Próba bez wysyłania (dry-run)

```
node dist\main.js --dry-run
```

Agent buduje paczkę, ale **nic nie wysyła**. Powstają dwa pliki:

- `logs\dry-run-RRRR-MM-DD.txt` — podsumowanie: liczba dokumentów wg typu, lista **korzeni** (ZK architektów)
  z dokumentami pochodnymi pod spodem, ostrzeżenia, faktury pominięte do ręcznej obsługi,
- `logs\dry-run-RRRR-MM-DD.json` — cała paczka (z danymi klientów).

Sprawdź w pliku `.txt`, w sekcji „KORZENIE ŁAŃCUCHÓW”:

- jest **ZK 115/PUŁ/10/2026** (31280),
- jest **ZK 142/PUŁ/10/2026** (31482), a pod nią **FS 234/PUŁ/10/2026** (31483),
- **nie ma** żadnego dokumentu zwykłej sprzedaży (każdy korzeń to zamówienie architekta).

Odeślij plik `.txt`. Plik `.json` wysyłaj tylko na prośbę i bezpiecznym kanałem (zawiera dane klientów).

Parametr `--since` czyta dokumenty od wskazanej daty zamiast domyślnych 18 miesięcy, np.
`node dist\main.js --dry-run --since 2026-10-01`.

## 6. Pierwsza synchronizacja (dopiero po zgodzie administratora portalu)

Gdy w `.env` są `PORTAL_URL`, `SUBIEKT_SYNC_TOKEN` i `SUBIEKT_SYNC_SECRET`:

```
node dist\main.js
```

Agent wysyła paczkę stronami po 200 dokumentów. Przy błędzie sieci lub serwera ponawia wysyłkę po 10 s, 60 s
i 5 min. Wynik jest w `logs\RRRR-MM-DD.log` i w panelu administratora portalu (menu „Subiekt” → „Status synchronizacji”).

**Zegar komputera musi być dokładny** (portal odrzuca żądania z czasem różniącym się o ponad 5 minut):
Ustawienia → Czas i język → „Ustaw czas automatycznie” włączone.

## 7. Codzienne uruchamianie (Harmonogram zadań)

W oknie PowerShell (klawisz Windows → `powershell` → Enter):

```
cd C:\PortalArchi\agent-subiekt
powershell -ExecutionPolicy Bypass -File .\install-task.ps1
```

Skrypt zapyta o hasło konta Windows (`SERWER\Użytkownik`) — jest potrzebne, żeby zadanie działało także wtedy,
gdy nikt nie jest zalogowany. Powstaje zadanie **„Portal Archi – sync Subiekt”**: codziennie o 20:00, na koncie
bieżącego użytkownika, bez najwyższych uprawnień.

Test: Harmonogram zadań → Biblioteka Harmonogramu zadań → „Portal Archi – sync Subiekt” → prawy przycisk →
**Uruchom**. Po chwili odśwież (F5): kolumna „Wynik ostatniego uruchomienia” ma pokazać `(0x0)`, a w
`logs\RRRR-MM-DD.log` ma być nowy wpis. Inną godzinę ustawisz parametrem: `... -File .\install-task.ps1 -Time 21:30`.

Usunięcie zadania:

```
powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1
```

Po zmianie hasła konta Windows uruchom `install-task.ps1` ponownie.

## 8. Logi

Katalog `C:\PortalArchi\agent-subiekt\logs`:

| Plik | Zawartość |
|---|---|
| `RRRR-MM-DD.log` | przebieg każdego uruchomienia danego dnia (start, liczby dokumentów, odpowiedzi portalu, błędy) |
| `probe-RRRR-MM-DD.txt` | raport sondy |
| `dry-run-RRRR-MM-DD.txt` / `.json` | podsumowanie i paczka z próby bez wysyłania |

Stare pliki można usuwać ręcznie; agent ich nie potrzebuje.

## 9. Kody wyjścia

Kod widać w Harmonogramie („Wynik ostatniego uruchomienia”) i po ręcznym uruchomieniu poleceniem `echo %ERRORLEVEL%`.

| Kod | Harmonogram | Znaczenie | Co zrobić |
|---|---|---|---|
| 0 | `(0x0)` | wszystko w porządku | — |
| 1 | `(0x1)` | błąd konfiguracji: brak wartości w `.env`, zły parametr | popraw `.env` (komunikat mówi, czego brakuje) |
| 2 | `(0x2)` | baza Subiekta: brak połączenia, błąd zapytania, sonda znalazła brakujące kolumny | odeślij log / raport sondy |
| 3 | `(0x3)` | portal nie przyjął paczki (sieć, token, podpis) mimo ponowień | sprawdź internet i zegar, odeślij log |
| 4 | `(0x4)` | paczka wysłana, ale portal odrzucił część dokumentów albo agent pominął dokumenty z błędnymi danymi | odeślij log (lista dokumentów jest w logu) |

## 10. Co odesłać

- po kroku 4: `logs\probe-RRRR-MM-DD.txt`,
- po kroku 5: `logs\dry-run-RRRR-MM-DD.txt`,
- po krokach 6–7: `logs\RRRR-MM-DD.log` z dnia uruchomienia i zrzut ekranu zadania w Harmonogramie
  (kolumny „Następne uruchomienie” i „Wynik ostatniego uruchomienia”).

## 11. Gdy coś nie działa

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| `Login failed for user 'portal_reader'` | złe hasło w `.env` |
| `Failed to connect to localhost\INSERTGT` | usługa „SQL Server Browser” nie działa — uruchom ją w `services.msc` albo wpisz w `.env` `SUBIEKT_DB_PORT=` z portem instancji (SQL Server Configuration Manager → Protokoły dla INSERTGT → TCP/IP → Adresy IP → IPAll) |
| komunikat o SSL / TLS przy łączeniu z bazą | odeślij log — trzeba będzie zmienić ustawienia szyfrowania połączenia |
| `HTTP 401` w logu | zły token lub sekret w `.env` albo zegar komputera spieszy się / spóźnia o ponad 5 minut |
| zadanie w Harmonogramie nie startuje, gdy nikt nie jest zalogowany | konto musi mieć hasło i prawo „Logowanie w trybie wsadowym”; uruchom `install-task.ps1` jako administrator |
| `npm` nie jest rozpoznawane | zamknij i otwórz okno `cmd` po instalacji Node.js |

## 12. Aktualizacja agenta

Podmień pliki w `C:\PortalArchi\agent-subiekt` (bez usuwania `.env` i `logs`), potem:

```
npm ci
npm run build
```

Zadania w Harmonogramie nie trzeba zakładać ponownie.

---

## Dla programisty

### Schemat bazy (zweryfikowano 30.10.2026)

Serwer `192.168.1.150\INSERTGT` (lokalnie `localhost\INSERTGT`), SQL Server 2014 SP2 Express (12.0.5000), baza `WD_sp`,
port dynamiczny (SQL Browser). Szczegóły i decyzje: `PLAN-SUBIEKT-2026-10-29.md`, Loop 5. Wszystkie tabele i kolumny
używane przez agenta są w `src/queries.ts` (`REQUIRED_COLUMNS`) i sprawdza je `--probe`.

- `dok__Dokument`: `dok_Typ` ZK = 16, FS = 2, KFS = 6, WZ = 11 (inne typy nigdy nie są wysyłane). Pochodny dokument
  wskazuje źródło przez `dok_DoDokId`; `dok_DoDokNrPelny = '+'` = FS z wielu dokumentów. Znacznik architekta:
  `dok_KatId = 14` (`sl_Kategoria` „Architekt”) lub `#A-…` w `dok_Uwagi`. Kategoria i Uwagi **nie** przechodzą z ZK na FS.
- `dok_Pozycja`: `ob_DokHanId` → `dok_Id`, `ob_TowId` → `tw__Towar.tw_Id` (NULL = pozycja jednorazowa),
  `ob_TowRodzaj` 1 towar / 2 usługa, `ob_Opis` (wielowierszowy), `ob_DokHanLp`, `ob_DoId`, `ob_Znak`.
- Kontrahent: `adrh__Historia` po `dok_PlatnikAdreshId`, zapasowo `adr__Ewid` (`adr_IdObiektu = dok_PlatnikId`,
  `adr_TypAdresu = 1`), na końcu `kh__Kontrahent.kh_Symbol` — nazwy kolumn adresów potwierdza sonda.
- Zapłata: `nz__Finanse` z `nzf_IdDokumentAuto = dok_Id`, należność `nzf_Typ = 39`, `nzf_Wartosc` = pozostało do
  zapłaty (`dok_Rozliczony` jest niewiarygodne).

Hipotezy do potwierdzenia sondą („Pozycje najnowszej KFS …”): na KFS wiersze `ob_Znak = -1` to stan przed korektą
i nie trafiają do paczki (portal przyjmuje pozycję KFS jako stan po korekcie); `ob_DoId` wiersza po korekcie wskazuje
pozycję FS — gdy nie, agent dopasowuje po (`ob_TowId`, nazwa).

### Budowa i testy (Mac / Linux)

```
cd agent-subiekt && npm ci && npm run build      # tsc → dist/
npm run test:agent                                # z katalogu repozytorium (Node ≥ 23.6; bez połączenia z SQL)
```

Moduły: `chain.ts` (wybór korzeni i łańcuchów, heurystyka FS '+'), `payload.ts` (wiersze → `SubiektDocumentPayload`),
`paid.ts` (is_paid), `send.ts` (podpis HMAC jak `src/lib/subiekt/auth.ts`, strony po 200, ponowienia, log),
`queries.ts` (SQL), `probe.ts`, `report.ts`, `config.ts`, `db.ts`, `main.ts`. `src/contract.ts` jest kopią typów
z `src/lib/subiekt/types.ts` (dist/ działa bez kodu portalu); zgodność pilnuje `tests/contract.test.ts`.
