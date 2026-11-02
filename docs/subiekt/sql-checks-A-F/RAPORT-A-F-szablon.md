# Raport zapytań kontrolnych A–F (Subiekt GT → walldecor-bridge, §6 pkt 3 planu)

Data: <<DATA>> · Serwer: <<SERWER>> · Baza: <<BAZA>> · Komputer: <<KOMPUTER>> · Login: portal_reader (tylko odczyt)

Pliki z surowymi wynikami leżą obok tego raportu (`00-srodowisko.txt`, `A.txt`, `A2.txt`, `A3.txt`, `B.txt`, `C.txt`, `D.txt`, `E.txt`, `F.txt`).
Ten raport to streszczenie dla osoby decydującej. Nie podejmuj tu decyzji o filtrach — wpisz fakty z plików.
Zasada: „nie wiem / brak w wynikach” to poprawna odpowiedź; nie zgaduj nazw kolumn ani znaczeń wartości.

## 1. Środowisko (z `00-srodowisko.txt`)

- Wersja SQL Server: …
- Liczba dokumentów razem: …
- Czas serwera: …

## 2. Znaczniki fiskalizacji / faktury detalicznej (z `A.txt`, `A2.txt`)

- Kolumny znalezione w `dok__Dokument` (nazwa, typ): …
- Rozkład wartości dla FS (dok_Typ 2) z 12 miesięcy: … (kolumna → wartość → ile)
- Rozkład wartości dla PA (dok_Typ 21): …
- Kolumny znalezione w innych tabelach: … (albo „brak”)

## 3. Status KSeF (z `A.txt`, `A3.txt`)

- Kolumny z KSeF w `dok__Dokument`: … (albo „brak”)
- Tabele z KSeF w nazwie lub kolumnach: … — kolumna wiążąca z `dok_Id`: … — liczba wierszy: …
- Wartości statusu i ich liczności (z `A2.txt` albo `F.txt` F2): …

## 4. Podtypy FS i PA, faktury do paragonu (z `B.txt`, `C.txt`)

| dok_Typ | dok_Podtyp | ile | brutto | do_paragonu | z_wielu_dokumentow |
|---|---|---|---|---|---|
| … | … | … | … | … | … |

- Przykłady FS → PA (`C.txt`): czy podtyp FS wystawionych do paragonu jest zawsze ten sam? Jaki? …
- Czy kwota FS = kwota PA w przykładach? …

## 5. Typy dokumentów z 12 miesięcy (z `D.txt`)

- Lista `dok_Typ` / `dok_Podtyp` z licznościami: …
- Typy inne niż 1, 2, 5, 6, 11, 16, 21 (kandydaci na zwroty do paragonu, faktury zaliczkowe itp.): …

## 6. FS bez NIP nabywcy (z `E.txt`)

- E1: fs_bez_nip = …, z_paragonem = …, bez_paragonu = …
- E2: przykłady bez paragonu (numer, data, kwota, z_dokumentu): …

## 7. KSeF a paragony (z `F.txt`; jeśli nie było F — napisz dlaczego)

- Użyty wariant szablonu i warunek: …
- fs_w_ksef = …, bez_nip = …, z_paragonem = …

## 8. Problemy podczas wykonania

- Błędy (treść z plików): … (albo „brak”)
- Czego nie udało się ustalić i dlaczego: …
