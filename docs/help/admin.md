# Pomoc dla ADMIN

## Zakres roli

ADMIN ma pełny dostęp do panelu: architekci, projekty, opiekunowie, wypłaty, cashback, backup, zespół, ustawienia i szablony email.

STAFF może obsługiwać projekty i rejestrować architektów, ale nie powinien wykonywać operacji finansowych ani zmieniać ustawień systemowych.

## Podgląd operacji

Do codziennej kontroli używaj dashboardu admina:

- ostatnia aktywność pokazuje zmiany statusów, wnioski o wypłatę, cashback i operacje administracyjne;
- pipeline pokazuje projekty według statusów i opiekunów;
- widok architekta pokazuje dane firmy, projekty, prowizje, cashback i historię rozliczeń;
- kolejka wypłat pokazuje wnioski wymagające decyzji ADMINA.

Najważniejszy obszar operacyjny przed startem z użytkownikami to ostatnia faza rozliczenia: poprawne przejście wypłat do `PAID` po realnym przelewie.

## Architekci i zespół

Architektów można dodać ręcznie albo przez import CSV. Po utworzeniu konta system wysyła mail powitalny z adresem portalu, loginem i hasłem.

ADMIN może:

- edytować dane architekta;
- ręcznie resetować hasło architekta;
- wysłać prośbę o uzupełnienie profilu;
- ustawić tier `SILVER`, `GOLD`, `PLATINUM` albo zostawić automatyczny tier;
- usunąć architekta tylko wtedy, gdy nie ma historii projektów i rozliczeń.

Zespół administracyjny jest zarządzany w ustawieniach. ADMIN może tworzyć konta `STAFF` i `ADMIN`, resetować hasła oraz zmieniać role innych członków zespołu.

## Statusy projektów

| Status | Znaczenie | Skutek operacyjny |
| --- | --- | --- |
| `ZGŁOSZONY` | Nowy projekt czeka na weryfikację. | Trafia do pipeline. |
| `PRZYJĘTY` | Projekt zaakceptowany. | Tworzy prowizje oczekujące i wysyła email akceptacji. |
| `W_REALIZACJI` | Projekt jest aktywnie prowadzony. | Pozostaje w pipeline i prowizjach oczekujących. |
| `ZAKOŃCZONY` | Projekt rozliczony. | Finalizuje prowizję i nalicza cashback 2%. |
| `NIEZREALIZOWANY` | Projekt odrzucony lub anulowany. | Usuwa prowizje oczekujące. |

Standardowa ścieżka to `ZGŁOSZONY` -> `PRZYJĘTY` -> `W_REALIZACJI` -> `ZAKOŃCZONY`.

Przed `ZAKOŃCZONY` sprawdź kwoty pozycji produktowych, numer zamówienia lub faktury, płatność pozycji oraz właściciela projektu. Ten status uruchamia naliczenia finansowe.

## Workflow wypłat prowizji

Architekt może złożyć wniosek tylko dla pełnej dostępnej prowizji `EARNED` i musi dodać fakturę PDF. Po złożeniu wniosku prowizja przechodzi do `IN_PAYMENT`.

Statusy wypłat:

- `PENDING` - wniosek oczekuje na obsługę.
- `IN_PAYMENT` - wypłata została przekazana do realizacji.
- `HOLD` - wypłata jest wstrzymana do wyjaśnienia.
- `PAID` - przelew został wykonany, a prowizja oznaczona jako zapłacona.
- `REJECTED` - wniosek odrzucono, a prowizja wraca do dostępnych środków.

Procedura ADMIN:

1. Otwórz kolejkę wypłat.
2. Sprawdź fakturę PDF, kwotę, dane architekta, NIP, numer konta i tytuł przelewu.
3. Jeśli brakuje danych, ustaw `HOLD` i wyślij prośbę o uzupełnienie profilu.
4. Po przygotowaniu przelewu ustaw `IN_PAYMENT`.
5. Ustaw `PAID` dopiero po realnym wykonaniu przelewu.

`PAID` i `REJECTED` są statusami końcowymi. Nie używaj `PAID` testowo na produkcji.

Wypłata zbiorcza działa tylko dla wybranych wniosków `PENDING` i od razu oznacza je jako `PAID`. Używaj jej wyłącznie po przygotowaniu i potwierdzeniu przelewów.

## Cashback i kody rabatowe

Cashback nalicza się przy `ZAKOŃCZONY` jako 2% wartości netto pozycji produktowych. Gotówkowa wypłata cashbacku jest wyłączona.

Obsługa wniosku:

1. Sprawdź architekta i kwotę wniosku.
2. Wygeneruj kod lub kartę rabatową poza portalem.
3. Wpisz kod w oczekującym wniosku.
4. System oznaczy wniosek jako `COMPLETED`, zapisze kod w historii i wyśle email do architekta.

## Backup przed wdrożeniem

Przed deployem na VPS wykonaj backup z serwera:

```bash
cd /var/www/walldecor-portal
mkdir -p ~/walldecor-backups
cp .env ~/walldecor-backups/env-$(date +%F-%H%M%S).bak
mysqldump -u "$DB_USER" -p "$DB_NAME" > ~/walldecor-backups/mysql-$(date +%F-%H%M%S).sql
tar -czf ~/walldecor-backups/private-uploads-$(date +%F-%H%M%S).tar.gz private_uploads
git rev-parse HEAD > ~/walldecor-backups/git-head-before-deploy.txt
```

Ręczny backup JSON z panelu lub `/api/admin/backup` jest pomocniczy. Nie zastępuje pełnego `mysqldump` i kopii katalogu `private_uploads`.

## Email i szablony

Szablony email są w ustawieniach admina. Przed zaproszeniem realnych użytkowników sprawdź:

- konfigurację SMTP w `.env`;
- `NEXTAUTH_URL`, żeby linki prowadziły na poprawny adres produkcji;
- aktywność szablonu `ARCHITECT_REGISTERED`;
- testowy reset hasła przez `PASSWORD_RESET`;
- testowy mail dla wypłaty i karty rabatowej.

Najważniejsze szablony:

- `ARCHITECT_REGISTERED` - konto nowego architekta;
- `PROJECT_ACCEPTED` - akceptacja projektu;
- `PAYOUT_PROCESSED` - wypłata prowizji;
- `PAYOUT_REDEEMED_CARD` - karta lub kod rabatowy;
- `PROFILE_INCOMPLETE` - prośba o uzupełnienie profilu;
- `PASSWORD_RESET` - reset hasła.

## Kontrola po deployu

Po wdrożeniu sprawdź produkcję w tej kolejności:

1. ADMIN loguje się i otwiera dashboard.
2. ADMIN pobiera backup JSON bez błędu.
3. STAFF loguje się i widzi panel admina.
4. STAFF może dodać architekta i projekt.
5. STAFF nie może wykonać wypłaty ani pobrać backupu.
6. Mail powitalny dla testowego architekta dochodzi.
7. Architekt loguje się i widzi tylko swoje projekty.
8. Architekt nie może otworzyć projektu innego architekta przez URL.
9. Testowy projekt przechodzi do `ZAKOŃCZONY`.
10. Po `ZAKOŃCZONY` naliczają się prowizja i cashback.
11. Wniosek o wypłatę z fakturą PDF pojawia się w kolejce.
12. ADMIN może przejść wypłatę do `PAID`, a status zostaje zapisany.
13. Reset hasła wysyła email, a link działa tylko raz.

Jeśli którykolwiek punkt nie przechodzi, zatrzymaj wdrożenie dla użytkowników i wróć do [DEPLOY-P1-CHECKLIST.md](../../DEPLOY-P1-CHECKLIST.md).
