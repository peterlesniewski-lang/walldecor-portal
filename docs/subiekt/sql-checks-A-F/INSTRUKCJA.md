# Zapytania kontrolne A–F w bazie Subiekta GT — instrukcja dla biura (człowiek albo agent Codex z computer use)

Data: 2026-11-01. Źródło: `PLAN-WALLDECOR-BRIDGE-2026-11-01.md` §6 pkt 3 (repo walldecor-portal, katalog `docs/subiekt/sql-checks-A-F/`).

**Po co:** zanim mostek walldecor-bridge zacznie liczyć przychody dla WallDecor-App, trzeba wiedzieć, jak baza Subiekta GT oznacza
(1) faktury wystawione do paragonu / faktury detaliczne / fiskalizację i (2) status KSeF dokumentu. Zapytania A–F tylko **czytają**
metadane, liczności, numery i kwoty dokumentów. Nie zwracają nazw klientów ani NIP-ów. Nic nie zmieniają.

**Gdzie:** komputer `SERWER` (ten z bazą Subiekta GT), instancja `localhost\INSERTGT`, baza `WD_sp`, login SQL `portal_reader`
(tylko odczyt: `db_datareader` + zakaz INSERT/UPDATE/DELETE/EXECUTE — utworzony 30.10.2026 wg instrukcji „Subiekt-GT-instrukcja-SQL-dla-portalu”).
Hasło `portal_reader` jest w menedżerze haseł użytkownika oraz w `C:\PortalArchi\agent-subiekt\.env` (jeśli agent jest już skopiowany).

**Czas:** 10–15 minut ścieżką 1, 30–40 minut ścieżką 2.

---

## 1. Co przygotować

1. Skopiuj katalog `sql-checks-A-F` (ten plik, `uruchom-A-F.ps1`, `RAPORT-A-F-szablon.md`, podkatalog `sql\`) do `C:\PortalArchi\sql-checks-A-F\`.
2. Upewnij się, że znasz hasło loginu `portal_reader` **albo** że istnieje `C:\PortalArchi\agent-subiekt\.env` z linią `SUBIEKT_DB_PASSWORD=…`.
3. Nie potrzebujesz hasła `sa` ani uprawnień administratora. Jeśli coś ich wymaga — zatrzymaj się i zgłoś.

## 2. Ścieżka 1 (zalecana): skrypt `uruchom-A-F.ps1` + `sqlcmd`

Skrypt sam znajduje `sqlcmd`, czyta hasło z `.env` agenta (albo pyta), łączy się jako `portal_reader`, wykonuje po kolei
`00-srodowisko`, `A`, `A2`, `A3`, `B`, `C`, `D`, `E` (i `F`, jeśli istnieje `sql\F.sql`), zapisuje każdy wynik do osobnego pliku
tekstowego i tworzy szablon raportu.

1. Klawisz Windows → wpisz `powershell` → Enter (zwykłe okno, nie „jako administrator”).
2. Wpisz dokładnie:

   ```powershell
   cd C:\PortalArchi\sql-checks-A-F
   powershell -ExecutionPolicy Bypass -File .\uruchom-A-F.ps1
   ```

3. Jeśli skrypt wypisze `BRAK sqlcmd`: zainstaluj narzędzie poleceniem `winget install --id Microsoft.Sqlcmd -e` (potwierdź `Y`), zamknij i otwórz
   PowerShell, uruchom skrypt ponownie. Jeśli `winget` nie działa — przejdź do ścieżki 2.
4. Jeśli pyta o hasło — wpisz hasło `portal_reader` (nie pokazuje się podczas pisania) → Enter.
5. Na końcu skrypt wypisze `=== PODSUMOWANIE ===` z linią na każde zapytanie (`OK` albo `BŁĄD`) oraz ścieżkę wyników:
   `C:\PortalArchi\sql-wyniki\A-F-RRRR-MM-DD\`. W środku: `00-srodowisko.txt`, `A.txt` … `E.txt`, `WYNIK.txt`, `RAPORT-A-F.md`.
6. **Zapytanie F** (status KSeF) wymaga nazw kolumn z wyników `A.txt` / `A2.txt` / `A3.txt`:
   - Jeśli `A.txt` **nie zawiera** żadnej kolumny ani tabeli z „KSeF” w nazwie → nie twórz `F.sql`; w raporcie, sekcja 7, wpisz „brak KSeF w bazie”.
   - Jeśli zawiera → otwórz `sql\F-szablon.sql` w Notatniku, wybierz wariant 1 (kolumna KSeF w `dok__Dokument`) albo 2 (osobna tabela z `A3.txt`),
     usuń drugi wariant, zastąp pola `<<...>>` prawdziwymi nazwami, wartość statusu „wysłana/przyjęta” wybierz z rozkładu w `A2.txt`
     (gdy statusem jest numer KSeF, użyj warunku `IS NOT NULL` z linii „b”). Zapisz jako `sql\F.sql` (nie `F.sql.txt`) i uruchom skrypt
     jeszcze raz — zapytania A–E policzą się ponownie (to w porządku), a `F.txt` powstanie.
   - Nie zgaduj nazw kolumn. Jeśli z wyników nie wynika, która kolumna jest statusem — zostaw F i opisz to w raporcie, sekcja 8.
7. Otwórz `RAPORT-A-F.md` i uzupełnij sekcje 1–8 faktami z plików `.txt` (streszczenie: nazwy kolumn, wartości, liczności; wolno
   wklejać fragmenty wyników). Nie podejmuj decyzji o filtrach — to robi odbiorca raportu.

## 3. Ścieżka 2 (zapas): SQL Server Management Studio (SSMS)

Używaj tylko, gdy `sqlcmd` nie da się uruchomić.

1. Uruchom SSMS. Connect: Server name `localhost\INSERTGT`, Authentication **SQL Server Authentication**, Login `portal_reader`, hasło → Connect.
2. W liście rozwijanej nad edytorem wybierz bazę `WD_sp` (albo wpisz `USE WD_sp;` jako pierwszą linię każdego zapytania).
3. Dla każdego pliku z `sql\` w kolejności `00-srodowisko`, `A`, `A2`, `A3`, `B`, `C`, `D`, `E`:
   - **File → Open → File…** → wskaż plik `.sql` (albo Ctrl+N i wklej zawartość),
   - **Ctrl+T** (Results to Text), potem **F5** (Execute),
   - w oknie wyników: kliknij w nie, **Ctrl+A**, **Ctrl+C**, wklej do Notatnika i zapisz jako `C:\PortalArchi\sql-wyniki\A-F-RRRR-MM-DD\<nazwa>.txt`
     (np. `A.txt`). Alternatywa: **Ctrl+Shift+F** przed F5 zapisuje wynik od razu do pliku `.rpt` — nazwij go jak wyżej.
   - Błąd też jest wynikiem: skopiuj jego treść do pliku.
4. Zapytanie F: jak w ścieżce 1 pkt 6 (uzupełnij szablon, wykonaj, zapisz `F.txt`).
5. Skopiuj `RAPORT-A-F-szablon.md` do katalogu wyników jako `RAPORT-A-F.md`, wpisz datę, serwer, bazę i komputer w nagłówku, uzupełnij sekcje 1–8.

## 4. Co odesłać

Cały katalog `C:\PortalArchi\sql-wyniki\A-F-RRRR-MM-DD\` (pliki `.txt`, `WYNIK.txt`, `RAPORT-A-F.md`) — na Dysk Google użytkownika
albo innym kanałem na Maca. Pliki nie zawierają hasła ani nazw klientów. Nie wysyłaj pliku `.env` agenta.

---

## 5. Instrukcja dla agenta (Codex, computer use) — tryb autonomiczny

Jesteś na komputerze `SERWER` z Windows 10. Twoje zadanie: wykonać ścieżkę 1 (sekcja 2), a przy braku `sqlcmd` ścieżkę 2 (sekcja 3),
i zostawić kompletny katalog wyników z wypełnionym `RAPORT-A-F.md`. Zasady:

**Wolno:**
- otwierać PowerShell, Notatnik, SSMS, Eksplorator plików; uruchamiać `uruchom-A-F.ps1` i zapytania z katalogu `sql\`;
- zainstalować `sqlcmd` poleceniem `winget install --id Microsoft.Sqlcmd -e` (jedyna dozwolona instalacja);
- utworzyć `sql\F.sql` z `F-szablon.sql` wyłącznie z nazwami kolumn i tabel, które widzisz w `A.txt` / `A3.txt`;
- czytać `C:\PortalArchi\agent-subiekt\.env` tylko po to, by skrypt pobrał hasło (nie kopiuj, nie wyświetlaj hasła).

**Nie wolno:**
- wykonywać żadnego innego SQL niż pliki z `sql\` (w szczególności żadnego INSERT/UPDATE/DELETE/ALTER/CREATE/EXEC, nawet „na próbę”);
- logować się innym loginem niż `portal_reader` (login `sa` i konta Windows są zakazane);
- zmieniać ustawień SQL Server, Subiekta, zapory, usług, Harmonogramu zadań; restartować komputera lub usług;
- instalować czegokolwiek poza `sqlcmd`; otwierać Subiekta GT; dotykać katalogu `C:\PortalArchi\agent-subiekt\` poza odczytem `.env` przez skrypt;
- wpisywać hasła do plików, raportu, schowka ani czatu; wysyłać plików poza komputer (odsyłkę robi użytkownik).

**Zatrzymaj się i zgłoś (nie kombinuj dalej), gdy:**
- skrypt kończy się kodem 2 (brak połączenia) po jednej ponownej próbie;
- hasło nie działa albo go nie ma (nie szukaj hasła w innych miejscach);
- `winget install --id Microsoft.Sqlcmd -e` nie działa i SSMS nie jest zainstalowany (nie instaluj SSMS);
- jakiekolwiek okno prosi o uprawnienia administratora (UAC) — kliknij „Nie”;
- wynik któregoś zapytania ma treść błędu, której nie da się usunąć ponownym uruchomieniem (zapisz błąd w raporcie, sekcja 8, i kontynuuj pozostałe).

**Kryterium ukończenia (sprawdź przed zgłoszeniem „gotowe”):**
1. W `C:\PortalArchi\sql-wyniki\A-F-RRRR-MM-DD\` są pliki `00-srodowisko.txt`, `A.txt`, `A2.txt`, `A3.txt`, `B.txt`, `C.txt`, `D.txt`, `E.txt`, `WYNIK.txt`, `RAPORT-A-F.md`
   oraz `F.txt` **albo** w raporcie sekcja 7 zawiera uzasadnienie braku F.
2. `WYNIK.txt` ma `OK` przy każdym zapytaniu, a przy `BŁĄD` raport sekcja 8 cytuje treść błędu.
3. Każda sekcja 1–8 raportu jest wypełniona faktami z plików (dozwolone „brak w wynikach”); żadna nie zawiera przypuszczeń o znaczeniu kolumn.
4. `A.txt` ma co najmniej wiersz `dok__Dokument | dok_Podtyp` (jeśli nie — zapytanie nie trafiło do bazy `WD_sp`, sprawdź połączenie).
5. W żadnym pliku nie ma hasła (`findstr /i "SUBIEKT_DB_PASSWORD" *.txt *.md` nie zwraca nic).

Na koniec podaj użytkownikowi ścieżkę katalogu wyników i treść `WYNIK.txt`.

---

## 6. Co z wyników wynika (dla odbiorcy raportu, nie dla biura)

| Pytanie decyzyjne | Skąd odpowiedź | Skutek w planie mostka |
|---|---|---|
| Czy FS do paragonu / faktura detaliczna ma własny znacznik? | `A.txt`, `A2.txt` (kolumny i rozkład dla dok_Typ 2 vs 21), `B.txt` (`do_paragonu` per podtyp), `C.txt` (podtyp przykładów) | Filtr `sales_summary`: wariant (i) znacznik lub `dok_DoDokId → PA`; wariant (ii) tylko `dok_DoDokId → PA` |
| Czy są zwroty do paragonu / typy detaliczne poza 2, 6, 21? | `D.txt` | Rozszerzenie listy typów w `sales_summary` lub świadome pominięcie |
| Gdzie jest status KSeF i jakie przyjmuje wartości? | `A.txt`, `A3.txt`, `A2.txt` / `F.txt` F2 | Kryterium KSeF w `unfiscalized_invoices` (decyzja 7a) |
| Czy firma wysyła do KSeF faktury konsumenckie? | `F.txt` → `bez_nip` > 0 | Jeśli tak — kryterium KSeF wymaga doprecyzowania z użytkownikiem |
| Ile FS bez NIP nie ma paragonu (skala kontroli fiskalizacji)? | `E.txt` E1/E2 | Priorytet narzędzia `unfiscalized_invoices` w Loopie 3 |
