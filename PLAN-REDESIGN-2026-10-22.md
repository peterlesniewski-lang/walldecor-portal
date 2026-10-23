# Plan redesignu Portalu Architekta — 2026-10-22

Źródło prawdy wizualnej: `docs/design-system.html` (v0.2). Zakres: **tylko Portal Architekta**. Logika biznesowa, akcje serwerowe, zapytania SQL i testy finansowe pozostają bez zmian. Zmieniamy warstwę prezentacji.

## Zasady dla każdego ticketu

- Najpierw uruchom skill `frontend-design`, potem przeczytaj `docs/design-system.html`, ten plik i `PROGRESS.md`.
- Używaj tokenów i prymitywów z `src/components/ui/*` i `src/app/globals.css` (powstają w T-R1). Nie definiuj własnych kolorów ani fontów w plikach stron.
- Logo: `public/walldecor-logo-dark.png` na jasnym tle, `public/walldecor-logo.jpg` tylko na ciemnym. Nigdy nie przerysowuj ani nie koloruj znaku.
- Zero `alert()`/`confirm()`, potwierdzenia inline. Każde `toLocale*` z `'pl-PL'`. Kwoty jako `5 000 PLN`, daty `10.06.2026`.
- Statusy w interfejsie tylko po polsku przez `StatusPill`; kody z bazy nie pojawiają się w UI.
- Jeden przycisk główny na ekran. Bez wielkich liter z rozstrzeleniem na przyciskach i w treści.
- Zachowaj wszystkie `href`, `id`, nazwy akcji i teksty, które sprawdzają testy w `tests/`. Przed oddaniem: `node --test tests/*.test.ts`, `npx tsc --noEmit | grep -v '^tests/' | grep -v '^.next/'`, `npx next build`.
- Komendy npm uruchamiaj z `PATH=/opt/homebrew/opt/node@25/bin:$PATH` (Node 26 nie buduje natywnych modułów).
- Zmiany tylko w plikach z ticketu. Bez commitów. Na koniec krótki raport: pliki, decyzje, rzeczy do wiedzenia dla innych ticketów.

## Fala 1 (sekwencyjnie)

| Ticket | Zakres | Pliki | Model |
| --- | --- | --- | --- |
| T-R1 Fundamenty i powłoka | Tokeny i fonty (Fraunces, Hanken Grotesk, IBM Plex Mono przez `@fontsource`), `globals.css` z `@theme`, prymitywy UI (`Button`, `StatusPill`, `KpiTile`, `Card`, `PageHeader`, `EmptyState`, `Banner`, `InlineConfirm`, `Logo`), jasny `Sidebar`, `MobileNav`, `HeaderActions`, `dashboard/layout.tsx`, `app/layout.tsx` | `package.json`, `package-lock.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/dashboard/layout.tsx`, `src/components/{Sidebar,MobileNav,HeaderActions}.tsx`, nowe `src/components/ui/*` | Sonnet |

## Fala 2 (równolegle, rozłączne pliki, po T-R1)

| Ticket | Zakres | Pliki | Model |
| --- | --- | --- | --- |
| T-R2 Dashboard admina | Centrum operacyjne: KPI, kolejka wypłat, pipeline, sygnały, prognoza, wykresy, cashback do decyzji | `src/app/dashboard/admin/page.tsx`, `src/admin/components/{AdminProjectPipeline,AdminPayoutsQueue,AdminCharts,AdminRedemptionQueue}.tsx`, `src/components/AdminProjectListItem.tsx` | Sonnet |
| T-R3 Architekci (admin) | Lista, profil, karta danych, rejestracja i edycja | `src/app/dashboard/admin/architects/page.tsx`, `src/app/dashboard/admin/architects/[id]/{page,ArchitectDataCard,ArchitectProfileClient}.tsx`, `src/components/{ArchitectList,ArchitectRegistrationModal,EditArchitectModal}.tsx` | Sonnet |
| T-R4 Projekt (admin) | Strona projektu admina z rozliczeniem prowizji, pozycje, pliki | `src/app/dashboard/admin/projects/[id]/{page,AdminProjectDetailClient}.tsx`, `src/components/ProjectFilesSection.tsx` | Sonnet |
| T-R5 Strona architekta | Dashboard, lista projektów, szczegóły projektu, portfel, cashback, wniosek o wypłatę, zgłoszenie projektu, profil | `src/app/dashboard/{page,projects/page,projects/[id]/page,wallet/page}.tsx`, `src/components/{DashboardPipeline,ProjectListClient,ProjectDetailClient,MyDiscountCards,RedeemCashbackButton,CommissionPayoutButton,CommissionPayoutModal,ProjectSubmissionModal,ProfileSettingsModal,ProfileSettingsWrapper}.tsx` | Sonnet |
| T-R6 Logowanie, regulamin, pomoc, ustawienia | Strony auth, regulamin, pomoc (admin i archi), ustawienia zespołu i emaili, import CSV | `src/app/auth/**`, `src/app/regulamin/page.tsx`, `src/app/dashboard/help/**`, `src/app/dashboard/admin/help/**`, `src/components/MarkdownArticle.tsx`, `src/app/dashboard/admin/settings/**`, `src/admin/components/AdminCSVImportModal.tsx` | Sonnet |

## Fala 3 (orkiestrator)

- Testy, tsc, build, grep na stare klasy (`gold-gradient`, `gold-text`, `glass-panel`, `bg-[#231f20]`, `Inter`).
- Podgląd lokalny (`DB_TYPE=sqlite`, Node 25) i zrzuty ekranów desktop + 390 px dla ADMIN i ARCHI.
- Commit, PR, deploy przez Coolify, smoke test na produkcji.
