# Plan Zadań (Task Plan) - Portal Architekta WallDecor

## Faza 1: B - Blueprint (Wizja i Logika)

- [x] Analiza Product Brief v1.2
- [x] Opracowanie `implementation_plan.md`
- [x] Definicja schematu bazy danych (SQLite/MySQL parity)

## Faza 2: L - Link (Konektywność)

- [x] Konfiguracja NextAuth.js z bazą danych
- [x] Ustawienie połączenia z bazą via `preprocessSQL`
- [x] Migracja z `middleware.ts` do `proxy.ts`

## Faza 3: A - Architect (Architektura Portalu)

- [x] Implementacja RBAC (Proxy & Server Actions)
- [x] Dashboard: Widgety finansowe i pasek Tier
- [x] System Projektów: Pipeline i walidacja pozycji PRODUCT
- [x] Logika Cashback: Naliczanie 2% i mechanizm FIFO
- [x] Realizacja Cashback: System kart rabatowych i wniosków

## Faza 4: S - Stylize (UI i UX)

- [x] Interfejs Next.js (App Router) zgodny z marką
- [x] Responsywność dla urządzeń mobilnych
- [x] Podstrony administracyjne dla architektów
- [ ] Powiadomienia o statusach projektów

## Faza 5: T - Trigger (Wdrożenie)

- [ ] Przygotowanie paczki do "Setup Node.js App" w cPanel
- [ ] Migracja bazy danych na środowisko produkcyjne
- [ ] Konfiguracja Crona dla wygasania cashbacku
