# Pomoc dla STAFF

## Zakres roli

STAFF obsługuje architektów i projekty. Może rejestrować architektów, dodawać projekty na konto architekta, przypisywać opiekuna i zmieniać status projektu w procesie operacyjnym.

STAFF nie wykonuje operacji finansowych ani ustawień systemowych. Wypłaty, cashback, backup, szablony email, role zespołu i ręczne resety haseł są po stronie ADMINA.

## Dodanie architekta

1. Wejdź do panelu admina.
2. Otwórz listę architektów i wybierz dodanie architekta.
3. Uzupełnij imię, nazwisko, email oraz hasło tymczasowe albo pozwól systemowi wygenerować hasło.
4. Uzupełnij dane firmowe, jeśli są znane: pracownia, NIP, adres, numer konta, status VAT.
5. Zapisz formularz.

Po zapisie system tworzy konto `ARCHI` i próbuje wysłać mail powitalny z adresem portalu, loginem i hasłem.

Jeśli konto powstało, ale mail nie został wysłany, nie zakładaj architekta drugi raz. Zanotuj email i przekaż sprawę do ADMINA, żeby sprawdził SMTP oraz szablon `ARCHITECT_REGISTERED`.

## Reset hasła architekta

STAFF nie wykonuje ręcznego resetu hasła z profilu architekta. Standardowa procedura:

1. Poproś architekta, aby na ekranie logowania użył resetu hasła.
2. Architekt powinien otrzymać link resetujący na swój email.
3. Jeśli mail nie dochodzi albo link nie działa po ponownej próbie, eskaluj do ADMINA.

Przy eskalacji podaj email architekta, czas próby i komunikat błędu.

## Dodanie projektu na konto architekta

1. Wejdź do panelu admina.
2. Dodaj projekt.
3. Wybierz właściwego architekta jako właściciela projektu.
4. Uzupełnij nazwę projektu i etykietę klienta.
5. Dodaj pozycje produktowe z kwotami netto.
6. Zapisz projekt.

Nowy projekt trafia do statusu `ZGŁOSZONY`.

## Zmiana statusu projektu

Dostępne standardowe przejścia:

| Z obecnego statusu | Możliwe następne statusy |
| --- | --- |
| `ZGŁOSZONY` | `PRZYJĘTY`, `NIEZREALIZOWANY` |
| `PRZYJĘTY` | `W_REALIZACJI`, `NIEZREALIZOWANY` |
| `W_REALIZACJI` | `ZAKOŃCZONY`, `NIEZREALIZOWANY` |
| `ZAKOŃCZONY` | brak dalszych przejść |
| `NIEZREALIZOWANY` | brak dalszych przejść |

Skutki statusów:

- `PRZYJĘTY` tworzy prowizje oczekujące i wysyła email o akceptacji projektu.
- `W_REALIZACJI` oznacza projekt jako aktywnie prowadzony.
- `ZAKOŃCZONY` finalizuje prowizję i nalicza cashback.
- `NIEZREALIZOWANY` usuwa oczekujące prowizje dla projektu.

Przed zmianą na `ZAKOŃCZONY` sprawdź architekta, klienta, pozycje produktowe i kwoty netto. Jeśli potrzebna jest korekta finansowa, przekaż sprawę do ADMINA.

## Czego STAFF nie może robić

STAFF nie może:

- zatwierdzać, odrzucać ani oznaczać wypłat jako `PAID`;
- wykonywać wypłat zbiorczych;
- zmieniać numerów faktur przy wnioskach wypłat;
- rozliczać wniosków cashback ani wydawać kodów rabatowych;
- korygować prowizji i cashbacku;
- usuwać architektów;
- zmieniać tierów architektów;
- tworzyć kont `ADMIN` lub `STAFF` i zmieniać ról zespołu;
- edytować ustawień systemowych i szablonów email;
- pobierać backupu administracyjnego.

## Gdzie sprawdzić problem

Najpierw sprawdź:

1. Komunikat w formularzu.
2. Czy rekord pojawia się po odświeżeniu strony.
3. Sekcję ostatniej aktywności w panelu admina.
4. Poprawność emaila architekta.
5. Czy problem dotyczy jednego projektu, czy wielu użytkowników.

Eskaluj do ADMINA, gdy:

- mail powitalny lub reset hasła nie dochodzi;
- projekt nie zmienia statusu;
- finalizacja projektu zwraca błąd;
- operacja dotyczy kwot, faktur, prowizji, wypłat lub cashbacku;
- pojawia się `Unauthorized`, `Internal Server Error` albo powtarzalny błąd API;
- nie masz pewności, czy operacja wpłynie na rozliczenia.

Przy eskalacji podaj email architekta, nazwę projektu, aktualny status, oczekiwaną zmianę, komunikat błędu i godzinę zdarzenia.
