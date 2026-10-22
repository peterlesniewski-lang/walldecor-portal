# Plan naprawy po audycie 2026-10-22

Źródło ustaleń: `AUDIT-2026-10-22.md`. Każdy ticket ma własny, rozłączny zestaw plików, żeby agenci mogli pracować równolegle. Tickety dotykające `src/app/actions/projects.ts` idą sekwencyjnie (fala 2).

Definicja ukończenia (dla każdego ticketu):
- `node --test tests/*.test.ts` zielone, nowe testy dodane tam, gdzie ticket to wymaga;
- `npx tsc --noEmit 2>&1 | grep -v '^tests/'` bez wyników;
- brak `alert()`/`confirm()`, każde `toLocale*` z `'pl-PL'`;
- zmiany tylko w plikach z ticketu, bez commitów.

## Fala 1 (równolegle)

| Ticket | Zakres (audyt) | Pliki | Model |
| --- | --- | --- | --- |
| T1 Finanse — korekty w ZAKOŃCZONYM | F-101, F-102, guard ponownej finalizacji | `src/app/actions/projects.ts`, `tests/` | Sonnet |
| T2 Import CSV — historia rozliczona | F-103 | `src/app/actions/import.ts`, `src/admin/components/AdminCSVImportModal.tsx`, `tests/` | Sonnet |
| T3 UI architekta | F-104, F-105, F-107, F-112, locale w wallet | `src/components/ProjectDetailClient.tsx`, `src/components/ProjectListClient.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/wallet/page.tsx` | Sonnet |
| T4 Regulamin | F-106 | `src/app/regulamin/page.tsx` | Haiku |
| T5 Responsywność | F-108 | `src/components/Sidebar.tsx`, `src/app/dashboard/layout.tsx`, nowy `src/components/MobileNav.tsx` (opcjonalnie) | Sonnet |
| T7 Strona projektu admina | F-113, `currentUserId` | `src/app/dashboard/admin/projects/[id]/page.tsx`, `.../AdminProjectDetailClient.tsx` | Sonnet |
| T9 Bezpieczeństwo transportu | F-109 (nagłówki), F-115 (rate limit resetu) | `next.config.ts`, `deploy/nginx.conf`, `src/app/api/auth/forgot-password/route.ts`, `src/lib/rateLimit.ts` (nowy), `src/lib/auth.ts` | Sonnet |

## Fala 2 (po T1, sekwencyjnie na `projects.ts`)

| Ticket | Zakres | Pliki | Model |
| --- | --- | --- | --- |
| T6 Spójność prowizji i obrotu | F-110, F-111, F-118 | `src/app/actions/projects.ts`, `src/app/dashboard/admin/architects/page.tsx`, `src/app/dashboard/admin/architects/[id]/page.tsx`, `src/app/dashboard/admin/page.tsx`, `tests/` | Sonnet |
| T8 Walidacje kont i statusów | F-114, F-116, F-117 | `src/app/actions/projects.ts`, `src/app/actions/architects.ts`, `src/app/actions/settings.ts`, `src/app/api/auth/reset-password/route.ts`, `src/components/ArchitectRegistrationModal.tsx`, `src/admin/components/AdminArchitectRegistrationModal.tsx`, `tests/` | Sonnet |
| T10 Porządki P2 | martwy kod, `alert()`, locale, link `#analytics`, STAFF „cashback do decyzji” | `src/admin/components/*` (martwe), `src/components/CashbackManager.tsx`, `src/components/PayoutButton.tsx`, `src/app/admin/*`, `src/app/api/admin/pipeline`, `src/app/api/admin/dashboard`, `src/components/MyDiscountCards.tsx`, `src/components/RedeemCashbackButton.tsx`, `src/components/ArchitectList.tsx`, `src/app/actions/cashback.ts` | Sonnet |

## Poza kodem (do decyzji Piotra)

- F-109: potwierdzić, czy live stoi na domenie z TLS (Coolify) — `deploy/nginx.conf` dostaje wariant HTTPS, ale certyfikat trzeba wystawić na serwerze.
- F-103: przyjęte założenie — wiersze „prowizja rozliczona = Tak” dostają prowizję `PAID` i **nie** naliczają cashbacku (historia była rozliczana poza portalem). Jeśli cashback za historię ma być przyznany, zmienić flagę w imporcie.
- PROGRESS.md opisuje stare stawki 7/10/14% w „Fazie 3” — do wyczyszczenia przy okazji.
