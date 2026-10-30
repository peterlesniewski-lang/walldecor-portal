# Project Rules

## Current task: Integracja Subiekt GT → portal
- Plan: `PLAN-SUBIEKT-2026-10-29.md` (loopy 0–7, DoD, checklist audytu atrap). Stan 2026-10-30: loopy 0–4 i 6 zmergowane do `main` (PR #6–#11); dowód scenariusza e2e w `docs/subiekt/LOOP6-DOWOD-2026-10-30.md`
- Loop 4b (tryb wewnętrzny `PORTAL_INTERNAL_MODE`, auto-kody `A-001…`, `CASHBACK_EXPIRY_MONTHS`) zmergowany; dowód `docs/subiekt/LOOP4B-DOWOD-2026-10-30.md`
- Zostały: Loop 5 (agent `agent-subiekt/`, start dopiero po weryfikacji schematu GT w biurze — sekcja „Warunek wstępny” w planie) i Loop 7 (wdrożenie, wyłącznie na polecenie użytkownika)
- Każdy loop w osobnym PR; nie zaczynać kolejnego bez zielonej bramki i sekcji DOWÓD
- Prowizje wyłącznie przez `src/lib/projectItems.ts`; pozycje `source = 'SUBIEKT'` bez edycji ręcznej; akcje admina Subiekta zwracają `{ ok, error }` zamiast rzucać błędy domenowe
- Otwarte kwestie do decyzji użytkownika: plan §6 (pkt 9–12)


## After each completed task

- Update PROGRESS.md with what was done, decisions made, conventions used
- Keep it brief - max 10 bullet points

## Before starting any task

- Read PROGRESS.md if it exists
