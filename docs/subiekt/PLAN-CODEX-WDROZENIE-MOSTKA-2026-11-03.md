# Plan wdrożenia mostka walldecor-bridge do końca — dla Codexa

Data: 2026-11-03. Zleceniodawca: Piotr Leśniewski. Cel: w ciągu 1–2 dni WallDecor-App na produkcji czyta sprzedaż z Subiekta GT przez mostek, a użytkownik ma działający klient MCP. Claude ma mało tokenów w tym tygodniu, więc **Codex prowadzi całość**; Claude wkracza tylko przy „STOP” z sekcji 9.

## 0. Stan wyjściowy (fakty, nie zakładaj innych)

| Element | Stan |
|---|---|
| Repo mostka `peterlesniewski-lang/walldecor-bridge` (lokalnie `~/projekty/walldecor-bridge`) | `main` = Loop 0+1 (`278a2ad`). PR #2 = Loop 2+3 (`bridge/loop-2-3`, `e4cf99b`), w przeglądzie w osobnej sesji Claude; po merge `main` ma 9 narzędzi i `/status`. |
| Mostek na `SERWER` (Windows 10, biuro) | Zainstalowany w `C:\PortalArchi\walldecor-bridge` z ZIP (Loop 0+1), zadanie Harmonogramu „WallDecor Bridge” działa, nasłuch `127.0.0.1:8787`, `/health` → `db: up`. Sonda kod 0. Dwa tokeny mostka (`walldecor-app` zakres `sales:read`, `piotr-claude` pełny) w `.env`, jawne wartości w `C:\PortalArchi\bridge-tokeny-dpapi.xml` (DPAPI). Październik 2026: SQL = REST co do grosza (MAG 109 649,99; PUŁ 361 420,60). |
| Sieć | **Decyzja 3b (2026-11-02): Cloudflare Tunnel + Cloudflare Access.** Tailscale porzucony. Nic jeszcze nie skonfigurowane. DNS `walldecor.pl` jest u IAI/IdoSell i tam zostaje → host mostka musi być w domenie prowadzonej w Cloudflare (pkt 1). |
| WallDecor-App (`peterlesniewski-lang/walldecor-app`, prod `https://app.walldecor.pl`, Coolify UUID `pwc0sk0w8cw8k8wkgwokgogk`) | PR #37 (Loop 4: ekran przychodów z danymi z Subiekta, „Zastosuj”) zmergowany `763b1e8`. PR #38 (nagłówki Cloudflare Access w kliencie) otwarty, bramka zielona. Ostatni deploy produkcyjny z 27.10 — merge do `main` **nie** wdraża sam. Zmienne `SUBIEKT_BRIDGE_*` w Coolify nie ustawione. |
| Plan źródłowy | `walldecor-portal/PLAN-WALLDECOR-BRIDGE-2026-11-01.md` (gałąź `docs/plan-cloudflare-tunnel-2026-11-02` → po merge `main`): §1 decyzje (3b!), §2.3 sieć, §4 Loopy 5–7, §5 checklist audytu atrap. |
| Agent portalu (`agent-subiekt`, inny projekt) | Sonda i dry-run na SERWER kod 0. Jego Loop 7 (wysyłka do portalu) jest poza tym planem — nie ruszać. |

## 1. Zasady (obowiązują w każdym kroku)

- **Tylko odczyt bazy.** Login `portal_reader`, nic innego. Żadnego SQL od klienta, żadnych zmian w SQL Server ani zaporze.
- **Sekrety:** hasła, tokeny mostka, service tokeny Cloudflare, token tunelu — nigdy w repo, raportach, zrzutach, logach, na Dysku. Do Coolify wpisujesz je **jako zmienne środowiskowe aplikacji** (nie do plików w repo). W raporcie: „ustawiono”, bez wartości.
- **Bez atrap:** każdy krok kończy się dowodem (wyjście komendy, odpowiedź `curl`, zrzut ekranu z danymi). Deklaracja „działa” bez dowodu = krok nieukończony.
- **Produkcja WallDecor-App:** deploy w Coolify i pierwsze „Odczytaj teraz” na produkcji wykonujesz tylko po jawnym „tak” użytkownika w rozmowie (pkt 5). Przyciski „Zastosuj” na produkcji **nie klikasz** — to decyzja użytkownika.
- **Merge:** w `walldecor-bridge` i `walldecor-app` możesz mergować PR, którego bramka jest zielona i który sam przejrzałeś (checklist §5 planu). Portal (`walldecor-portal`) — tylko dokumentacja; każdy merge do `main` portalu uruchamia deploy produkcyjny portalu (webhook), więc merguj tam wyłącznie zmiany w `docs/` i `*.md`.
- Limit iteracji naprawczych: 5 na krok. Potem STOP i raport.
- Bramki: mostek `npm test && npm run typecheck && npm run build` (+ `bash scripts/validate-loop2.sh` po Loopie 2+3); aplikacja `npm test`, `npm run typecheck:app`, `npm run build` (11 testów `ksef-sync.test.ts` pada niezależnie od tych zmian — ignoruj tylko ten plik).

## 2. Krok 1 — Domena i konto Cloudflare (użytkownik + Codex, 30 min)

Wymaga decyzji użytkownika, bo Codex nie kupuje domen ani nie zakłada kont.

1. Użytkownik: konto Cloudflare (istniejące lub nowe) i **domena w strefie Cloudflare**. Opcje: (a) dowolna domena, którą już ma w Cloudflare; (b) nowa tania domena przez Cloudflare Registrar (np. `walldecor-bridge.com`, koszt roczny ok. 10 USD); (c) inna posiadana domena z przeniesieniem NS do Cloudflare. **Nie** przenosić `walldecor.pl` (DNS sklepu u IAI).
2. Ustalić host mostka, np. `bridge.<domena>`. Dalej w planie: `<HOST>`.
3. Codex: w Zero Trust włączyć plan Free (wymaga podania metody płatności, 0 zł przy ≤ 50 użytkownikach). Zapisać nazwę zespołu Zero Trust `<team>.cloudflareaccess.com`.

**DoD:** w panelu Cloudflare strefa domeny jest „Active”, Zero Trust otwiera się bez błędu. Dowód: zrzut ekranu listy stref i strony Zero Trust → Overview.

## 3. Krok 2 — Tunel na SERWER (Codex przez computer use, 45 min)

1. Zero Trust → Networks → Tunnels → Create tunnel → Cloudflared → nazwa `serwer-bridge`. Skopiować polecenie instalacyjne dla Windows (zawiera token tunelu — nie zapisuj go nigdzie poza konsolą).
2. Na SERWER w PowerShell jako administrator: pobrać `cloudflared-windows-amd64.msi` z GitHub `cloudflare/cloudflared` (releases), zainstalować, potem `cloudflared service install <token>`. Sprawdzić `Get-Service cloudflared` → Running, start automatyczny.
3. W panelu tunelu: Public hostname → `<HOST>`, service `HTTP`, URL `127.0.0.1:8787`. Cloudflare sam tworzy rekord CNAME (proxied).
4. Test z SERWER i z Maca: `curl -s https://<HOST>/health` → na tym etapie (bez Access) 200 z `{"ok":true,...,"db":"up"}`. Test negatywny: `curl -s http://<IP publiczne biura>:8787/health` → brak odpowiedzi.
5. `Restart-Computer` SERWER; po ≤ 3 min z Maca `curl https://<HOST>/health` → 200 bez logowania użytkownika na SERWER (zadanie mostka i usługa cloudflared startują same).

**DoD:** `/health` przez `<HOST>` z Maca → 200 po restarcie bez logowania; port 8787 niewidoczny z Internetu. Dowód: wyjścia `curl`, `Get-Service cloudflared`, zrzut zadania Harmonogramu.

## 4. Krok 3 — Cloudflare Access (Codex, 30 min)

1. Zero Trust → Access → Service Auth → Service Tokens → Create: `walldecor-app` oraz `piotr-mcp` (czas życia: non-expiring albo 1 rok — zapisać datę wygaśnięcia w raporcie). Client ID i Client Secret pokazują się **raz**: Secret dla `walldecor-app` wkleić od razu do Coolify (krok 5, zmienna), Secret dla `piotr-mcp` przekazać użytkownikowi bezpiecznym kanałem (nie Dysk, nie raport).
2. Access → Applications → Add → Self-hosted: nazwa `walldecor-bridge`, domena `<HOST>` (cały host, ścieżka pusta). Policy: nazwa `service-tokens`, action **Service Auth**, include → Service Token → oba tokeny. Żadnej polityki „Allow” z logowaniem e-mail w v1.
3. Testy z Maca:
   - `curl -s -o /dev/null -w '%{http_code}\n' https://<HOST>/health` → **403** (Access blokuje bez nagłówków; Cloudflare może zwrócić 302 do strony logowania — też znaczy „zablokowane”, zapisz kod).
   - `curl -s -H "CF-Access-Client-Id: <id piotr-mcp>" -H "CF-Access-Client-Secret: <secret>" https://<HOST>/health` → 200.
   - `curl -s -H "CF-Access-Client-Id: …" -H "CF-Access-Client-Secret: …" https://<HOST>/api/tools` → **401** od mostka (brak tokena mostka). Z dodanym `-H "Authorization: Bearer <token piotr-claude>"` → 200 z listą narzędzi.
   - Zero Trust → Logs → Access: widać wpisy z nazwą service tokena.

**DoD:** bez pary nagłówków Access blokuje; z parą i tokenem mostka odpowiada mostek. Dowód: cztery wyjścia `curl` z kodami, zrzut logu Access.

## 5. Krok 4 — Aplikacja: PR #38, zmienne w Coolify, deploy, pierwszy odczyt (Codex, 1 h)

1. Przejrzeć PR #38 w `walldecor-app` (3 pliki: klient, test, `.env.example`), uruchomić bramkę w świeżym worktree z `main` po merge lokalnym, zmergować (merge commit, jak dotąd w repo).
2. W Coolify (`http://51.83.197.9:8000`, aplikacja `pwc0sk0w8cw8k8wkgwokgogk`, Environment Variables) ustawić: `SUBIEKT_BRIDGE_URL=https://<HOST>`, `SUBIEKT_BRIDGE_TOKEN=<token walldecor-app z SERWER>`, `SUBIEKT_BRIDGE_CF_ACCESS_CLIENT_ID=<id walldecor-app>`, `SUBIEKT_BRIDGE_CF_ACCESS_CLIENT_SECRET=<secret>`, `SUBIEKT_BRIDGE_WAREHOUSE_MAP=PUŁ:PUL,MAG:JAG,INT:PUL:ECOMMERCE`, `SUBIEKT_BRIDGE_AUTO_SYNC=off` (na start ręcznie; `on` po decyzji użytkownika). Token mostka `walldecor-app` odczytać na SERWER z `bridge-tokeny-dpapi.xml` (PowerShell `Import-Clixml` + `ConvertFrom-SecureString -AsPlainText`) i wpisać ręcznie do Coolify — nie przez Dysk, nie przez czat w jawnej postaci.
3. **STOP — zapytać użytkownika: „Wdrażam `main` WallDecor-App na produkcję (zmiana: ekran przychodów z Subiekta + nagłówki Access)?”** Po „tak”: Coolify → Deploy (lub `GET http://51.83.197.9:8000/api/v1/deploy?uuid=pwc0sk0w8cw8k8wkgwokgogk&force=false` z tokenem API Coolify, który jest w pamięci Claude/u użytkownika). Obserwować do „finished”, `https://app.walldecor.pl` odpowiada, logowanie działa, pozostałe ekrany bez regresji (smoke: dashboard, finanse, KSeF).
4. Jako ADMIN: Finanse → Przychody → sekcja „Subiekt GT” → **Odczytaj teraz**. Oczekiwane: komunikat „Odczytano N wierszy”, w komórkach pojawia się wiersz „Subiekt: kwota · dok. n”, brak ostrzeżeń o mapie magazynów, brak nieprzypisanych magazynów (ewentualnie `INNE`).
5. Dowód liczbowy: suma komórek PUL (SALON+MONTAZ+ECOMMERCE) za październik 2026 = 361 420,60; JAG = 109 649,99 (wartości z porównania na SERWER). Różnica > 0,01 = STOP.
6. Kontener → mostek z wnętrza: w Coolify „Execute command” `node -e "fetch(process.env.SUBIEKT_BRIDGE_URL+'/health',{headers:{'CF-Access-Client-Id':process.env.SUBIEKT_BRIDGE_CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':process.env.SUBIEKT_BRIDGE_CF_ACCESS_CLIENT_SECRET}}).then(r=>r.text()).then(console.log)"` → `{"ok":true,...}`.
7. Test negatywny ról: zalogować się jako MANAGER/EMPLOYEE — brak przycisku „Odczytaj teraz” i „Zastosuj”; `POST /api/finance/subiekt-revenue/refresh` bez sesji → 401.
8. **Nie klikać „Zastosuj”.** Zapytać użytkownika, czy pierwsze „Zastosuj” ma objąć tylko miesiące zamknięte (plan §4 Loop 7 — otwarte pytanie). Zapisać odpowiedź w raporcie; wykonać tylko to, co poleci.

**DoD:** ADMIN na produkcji widzi kwoty z Subiekta zgodne z SQL co do grosza; inne role nie widzą przycisków; kontener dociera do mostka przez Access. Dowód: zrzuty ekranu przychodów (bez danych klientów — ekran ich nie zawiera), log deployu, wyjścia `curl`/`node -e`.

## 6. Krok 5 — Nowa wersja mostka na SERWER po merge PR #2 (Codex, 30 min; tylko gdy PR #2 jest zmergowany)

1. Na SERWER: `cd C:\PortalArchi\walldecor-bridge`, jeśli katalog nie jest klonem gita (był z ZIP) → pobrać ZIP `main` z GitHuba i rozpakować **obok**, skopiować `.env`, `npm ci`, `npm run build`, `node dist\main.js --probe` (kod 0), zatrzymać zadanie Harmonogramu, podmienić katalog, uruchomić zadanie. Zachować stary katalog jako `walldecor-bridge.old` do czasu potwierdzenia.
2. `curl /health` → `version` nowa; `curl -H … https://<HOST>/status` → strona HTML z listą ostatnich wywołań; `curl -H … "https://<HOST>/api/finance/unfiscalized-invoices?from=2026-08-01&to=2026-10-31"` (ścieżkę wziąć z README mostka) → JSON z licznikami; w raporcie tylko liczby, bez numerów faktur i nazw.
3. Powtórzyć krok 4.4 (Odczytaj teraz) — wynik bez zmian.

**DoD:** nowa wersja działa jako zadanie, `/status` pokazuje realne wywołania, kontrola fiskalizacji zwraca dane. Dowód: wyjścia `curl`, zrzut `/status`.

## 7. Krok 6 — Klient MCP użytkownika (Loop 5 planu; Codex przygotowuje, użytkownik wykonuje na Macu, 20 min)

1. Użytkownik dostaje (bezpiecznym kanałem) token mostka `piotr-claude` i parę service tokena `piotr-mcp`. Zapisuje je w `~/.zshrc` jako `WALLDECOR_BRIDGE_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
2. Claude Code: `claude mcp add --transport http walldecor-bridge https://<HOST>/mcp --header "Authorization: Bearer $WALLDECOR_BRIDGE_TOKEN" --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"`; w sesji: `/mcp` pokazuje serwer połączony, pytanie „jaka była sprzedaż brutto w październiku per magazyn?” daje liczby równe SQL.
3. Codex CLI użytkownika (`~/.codex/config.toml`): `[mcp_servers.walldecor_bridge] url = "https://<HOST>/mcp" bearer_token_env_var = "WALLDECOR_BRIDGE_TOKEN"` + `http_headers = { "CF-Access-Client-Id" = "…", "CF-Access-Client-Secret" = "…" }` (jeśli wersja Codexa nie obsługuje `http_headers`, zapisać to w raporcie i zostawić tylko Claude Code).
4. Zapisać gotowe polecenia w README mostka, sekcja „Klienci” (PR w `walldecor-bridge`, merge po bramce).

**DoD:** użytkownik zadaje pytanie w Claude Code i dostaje odpowiedź z mostka; wpis w `/status` i w logu Access. Dowód: zrzut z Claude Code + fragment `/status`.

## 8. Krok 7 — Scenariusz końcowy (Loop 6 planu, 45 min)

Jednego dnia, na produkcji, bez dotykania bazy ręcznie:

1. Rano 07:30 (jeśli `SUBIEKT_BRIDGE_AUTO_SYNC=on` włączone za zgodą użytkownika) w logu kontenera jest wpis `SUBIEKT_AUTO_SYNC` ze statusem OK; inaczej ADMIN klika „Odczytaj teraz”.
2. ADMIN porównuje wiersz „Subiekt” z wpisanym przychodem za poprzedni miesiąc; „różnica” widoczna tam, gdzie się różnią.
3. Użytkownik w Claude Code pyta o niefiskalizowane faktury dla osób prywatnych z ostatnich 3 miesięcy → lista z numerami i podsumowaniem; ta sama liczba co `curl` do REST.
4. Użytkownik wyłącza SERWER na 2 minuty → „Odczytaj teraz” pokazuje komunikat „Mostek Subiekt jest niedostępny…”, a dane z poprzedniego odczytu zostają na ekranie z datą ostatniego odczytu; po włączeniu SERWER odczyt znów działa bez interwencji.
5. Wszystko spisane w `walldecor-bridge/docs/LOOP5-7-DOWOD-2026-11-DD.md` z checklistą §5 planu odhaczoną punkt po punkcie; PR, merge po bramce.

**DoD:** pięć punktów z dowodami. To jedyna definicja „gotowe”.

## 9. Kiedy STOP i wołać Claude/użytkownika

- Kwoty aplikacja vs SQL różnią się o więcej niż 0,01.
- Sonda mostka zwraca kod 2 po aktualizacji (brak kolumn).
- Cokolwiek wymagałoby zapisu do bazy, innego loginu niż `portal_reader`, otwarcia portu lub zmiany zapory.
- Deploy produkcyjny aplikacji kończy się błędem albo po deployu nie działa logowanie/dashboard → natychmiast „Redeploy” poprzedniego udanego deployu w Coolify (commit `59a1b60` z 27.10) i raport.
- Bramka czerwona po 5 iteracjach.
- Pytania do użytkownika z krokami 1, 4.3, 4.8, 8.1 — nie zakładaj odpowiedzi.

## 10. Raport końcowy (Dysk, folder `WDROZENIE-MOSTKA-2026-11-DD`)

`RAPORT.md` po polsku: tabela kroków 1–7 ze statusem (zrobione / pominięte + powód), dowody (wyjścia komend, zrzuty bez sekretów), host `<HOST>`, daty ważności service tokenów, lista PR-ów z numerami i stanem, odpowiedzi użytkownika na pytania, co zostało. Żadnych tokenów, haseł ani nazw klientów.
