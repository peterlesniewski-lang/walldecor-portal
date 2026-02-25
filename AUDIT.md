# AUDIT.md — WallDecor Architect Partner Portal
**Data audytu:** 2026-02-24
**Zakres:** Pełny przegląd kodu źródłowego (security, logika finansowa, walidacja, edge cases, UX)

---

## 🔴 KRYTYCZNE

---

### [K1] Sekrety w pliku `.env` — klucze w repozytorium

**Plik:** `.env`

Plik `.env` zawiera prawdziwe klucze, które mogą wyciec jeśli repozytorium jest choć raz opublikowane lub udostępnione:
- `GEMINI_API_KEY=AIzaSyCE_GD5ybpP6AqBHWBgjwOGgMxzAZ3sayo` — prawdziwy klucz API
- `NEXTAUTH_SECRET=pYv1kL9pU5mN0zX2wQ8rT4sV3bF6gH7j` — sekret sesji JWT

Jeśli ktoś ma dostęp do repozytorium lub historii commitów, może przejąć sekcję autoryzacyjną. `.gitignore` powinien wykluczać `.env` — wymaga weryfikacji.

---

### [K2] Middleware RBAC nie chroni `/dashboard/admin/*`

**Plik:** `src/proxy.ts:15`

```typescript
if (path.startsWith("/admin") && token?.role !== "ADMIN") { ... }
```

Middleware chroni `/admin/*`, ale **nie** `/dashboard/admin/*`. Architekt (ARCHI) może wejść na `/dashboard/admin` bez żadnego przekierowania middleware. Ochrona opiera się wyłącznie na sprawdzeniach w page.tsx każdej strony. Brakuje warstwy defense-in-depth w middleware.

---

### [K3] Pliki faktur przechowywane publicznie bez autoryzacji

**Plik:** `src/app/actions/projects.ts:355-368`

```typescript
const uploadDir = join(process.cwd(), 'public', 'uploads', 'invoices');
const invoiceUrl = `/uploads/invoices/${fileName}`;
```

Faktury (wrażliwe dokumenty finansowe) trafiają do folderu `public/`, co oznacza, że są dostępne bez uwierzytelnienia pod adresem `/uploads/invoices/invoice_{userId}_{timestamp}.pdf`. Wzorzec URL jest przewidywalny — znając `userId` można enumerate pliki.

---

### [K4] Brak serwerowej walidacji typu pliku faktury

**Plik:** `src/app/actions/projects.ts:338-366`

Serwer sprawdza tylko `invoiceFile.size === 0`. Walidacja MIME type (`application/pdf`) jest wyłącznie po stronie klienta. Użytkownik może przesłać dowolny plik z rozszerzeniem `.pdf` — skrypt, HTML, itp.

---

### [K5] `deleteProjectItem` dla ZAKOŃCZONY używa hacka z 0.01 PLN

**Plik:** `src/app/actions/projects.ts:671-676`

```typescript
if (status === 'ZAKOŃCZONY') {
    return await updateProjectItem(itemId, 0.01, note || 'Usunięcie pozycji (korekta do 0)');
    // Note: I used 0.01 because updateProjectItem checks for > 0.
}
```

Pozycja **nie jest usuwana** — ustawiana jest na 0.01 PLN. Skutki:
- Pozycja widoczna w UI z wartością 0.01 PLN
- Obrót architekta jest zawyżony o 0.01 PLN
- Prowizja dla tej pozycji wynosi 0.0007 PLN (nie zero)
- Każda "usunięta" pozycja zostawia śmieciowy rekord w bazie

---

### [K6] Stawka prowizji BEGINNER hardcoded na 7% bez decyzji biznesowej

**Plik:** `src/app/actions/projects.ts:141-146`

```typescript
const brackets = [
    { threshold: 10000, rate: 0.07 }, // BEGINNER: 0–9 999 PLN (Set to 7% as per request)
    { threshold: 50000, rate: 0.07 }, // SILVER: 10 000–49 999 PLN
    ...
];
```

W PROGRESS.md (Otwarte kwestie #1) zapisano: "Stawka prowizji BEGINNER — TBD — wymagana decyzja biznesowa". Kod stosuje 7% (tę samą co SILVER). Jeśli decyzja ma być 0% lub inna stawka, całe dotychczasowe obliczenia są błędne. Identyczny kod powielony w `updateProjectItem` i `addProjectItem`.

---

### [K7] `requestCommissionPayout` blokuje WSZYSTKIE prowizje EARNED, nie tylko kwotę wniosku

**Plik:** `src/app/actions/projects.ts:380-383`

```typescript
await query(
    "UPDATE commissions SET status = 'IN_PAYMENT', payout_id = ? WHERE architect_id = ? AND status = 'EARNED'",
    [requestId, session.user.id]
);
```

Architekt wnioskuje o kwotę X (np. 500 PLN), ale system blokuje **wszystkie** prowizje EARNED (np. 2000 PLN). Jeśli wniosek jest odrzucony, wszystkie wracają do EARNED — to poprawne. Ale jeśli architekt chciałby wypłacić np. 500 z 2000 PLN, nie może. Plus — kwota `amount` na wniosku może nie odpowiadać sumie zablokowanych prowizji, co jest niespójnością.

---

## 🟡 ŚREDNIE

---

### [S1] `updateProjectStatus` nie waliduje dozwolonych wartości statusu

**Plik:** `src/app/actions/projects.ts:55-64`

Funkcja przyjmuje `status: string` bez sprawdzenia, czy należy do dozwolonych wartości (`ZGŁOSZONY`, `PRZYJĘTY`, `W_REALIZACJI`, `ZAKOŃCZONY`, `NIEZREALIZOWANY`). ADMIN/STAFF mogą wstrzyknąć dowolny status, łącznie z przywróceniem `NIEZREALIZOWANY` → `ZGŁOSZONY`.

---

### [S2] `updateArchitectAdminFields` — brak walidacji wartości

**Plik:** `src/app/actions/architects.ts:9-27`

- `tier_override` — przyjmuje dowolny string. Powinien być z listy: `NULL | 'SILVER' | 'GOLD' | 'PLATINUM'`
- `commission_rate` — przyjmuje dowolną liczbę, brak weryfikacji zakresu (np. 0–100). Można wpisać -10 lub 999.

---

### [S3] `registerArchitect` — brak walidacji formatu emaila po stronie serwera

**Plik:** `src/app/actions/projects.ts:223-269`

Email jest przechowywany bez sprawdzenia formatu. Błędny email prowadzi do problemu z logowaniem (autentykacja wyszukuje po emailu).

---

### [S4] Niespójność między PENDING a EARNED kwotą prowizji

**Plik:** `src/app/actions/projects.ts:89-98` vs `src/app/actions/projects.ts:141-163`

Prowizja PENDING (tworzona przy PRZYJĘTY) = `commission_rate * amount_net` (flat rate, domyślnie 7%).
Prowizja EARNED (tworzona przy ZAKOŃCZONY) = wynik progresywnych przedziałów.

Efekt: admin KPI "Prowizje w toku" jest niedokładne — wyświetla sumę po flat rate, a faktyczna EARNED po finalizacji będzie inna. Informacja może być myląca przy projektach z dużym obrotem (gdzie GOLD/PLATINUM bracket daje wyższą kwotę).

---

### [S5] Edycja pozycji ZAKOŃCZONEGO projektu nie przelicza prowizji innych pozycji w tym projekcie

**Plik:** `src/app/actions/projects.ts:488-556`

Gdy admin edytuje kwotę pozycji A w ZAKOŃCZONYM projekcie, system oblicza korektę tylko dla A (różnica nowy-stary). Nie uwzględnia, że zmiana A przesuwa "running turnover" dla kolejnych pozycji B, C, D w tym samym projekcie. Przy dużych kwotach i granicach tierów (np. 50k/120k PLN) może to prowadzić do błędnych prowizji dla pozycji przetworzonych po A.

**Przykład reprodukcji:**
- Poprzedni obrót: 45 000 PLN
- A = 8 000 PLN (split: 5000@7% + 3000@10% = 650 PLN)
- B = 5 000 PLN (base 53k, wszystko @10% = 500 PLN)
- Admin redukuje A do 2 000 PLN:
  - Korekta A = -510 PLN ✓
  - Prowizja B POWINNA spaść do 410 PLN (bo teraz base=47k, część B wróciła do 7%)
  - System NIE tworzy korekty dla B → błąd 90 PLN

---

### [S6] Obliczanie obrotu dla tieru różni się między widokiem architekta a logiką prowizji

**Plik:** `src/lib/services.ts:57-63` vs `src/app/actions/projects.ts:124-132`

`getArchitectStats` (dashboard, tier progress): `p.status != 'NIEZREALIZOWANY'` — liczy ZGŁOSZONY, PRZYJĘTY, W_REALIZACJI jako obrót.
`updateProjectStatus(ZAKOŃCZONY)`: `p.status = 'ZAKOŃCZONY' AND p.id != ?` — używa tylko zakończonych.

Architekt widzi wyższy obrót w dashboard → wyższy tier → wyższy bracket... ale faktyczna prowizja jest liczona po niższej podstawie.

---

### [S7] `updatePayoutStatus` nie blokuje ponownego zatwierdzenia REJECTED wniosku

**Plik:** `src/app/actions/projects.ts:393-451` i `src/app/actions/admin.ts:21`

Guard w `handlePayoutRequest`:
```typescript
if (payoutReq.status === 'APPROVED' || payoutReq.status === 'REJECTED') {
    throw new Error("Wniosek został już przetworzony.");
}
```

Ale `updatePayoutStatus` wywoływane bezpośrednio (z project detail / batch) nie ma tego guardu. REJECTED payout można zmienić na APPROVED z poziomu project detail page. Commissions wrócą do EARNED (po REJECT), potem zostaną oznaczone PAID (po ponownym APPROVE) — może wystąpić podwójne rozliczenie.

---

### [S8] STAFF nie może zmieniać statusu projektu na stronie szczegółów projektu

**Plik:** `src/app/dashboard/admin/projects/[id]/AdminProjectDetailClient.tsx:137`

```typescript
if (!isAdmin || transitions.length === 0) return null;
```

`isAdmin = session.user.role === 'ADMIN'` — STAFF jest wykluczony. Jednak `updateProjectStatus` po stronie serwera akceptuje STAFF. STAFF może zmieniać statusy przez pipeline/listę projektów, ale NIE z poziomu strony szczegółów projektu. Niespójne uprawnienia.

---

### [S9] Niespójność minimalnej kwoty wypłaty prowizji

**Plik:** `src/app/dashboard/wallet/page.tsx:42` i `src/app/actions/projects.ts:334`

- Kod i walidacja serwera: min. **100 PLN**
- Sekcja "Zasady Programu" na stronie portfela: min. **300 PLN**

Dwie różne kwoty w tym samym serwisie — błąd informacyjny dla architekta.

---

### [S10] `AdminPayoutsQueue` — brak potwierdzenia dla akcji indywidualnych (Reject)

**Plik:** `src/admin/components/AdminPayoutsQueue.tsx:91-103`

Przycisk "Odrzuć" (`REJECT`) wywołuje akcję natychmiast po kliknięciu. Brak inline confirmation (w odróżnieniu od batch approval). Jedno przypadkowe kliknięcie odrzuca wniosek i cofa prowizje architekta.

---

### [S11] `requestCommissionPayout` nie jest atomiczny — ryzyko niespójności danych

**Plik:** `src/app/actions/projects.ts:327-391`

Sekwencja bez transakcji:
1. Sprawdź saldo prowizji
2. Prześlij plik na dysk
3. Utwórz `payout_request` w DB
4. Zaktualizuj `commissions` → IN_PAYMENT

Jeśli krok 3 lub 4 się nie powiedzie, plik jest już na dysku. Jeśli krok 4 się nie powiedzie, payout_request istnieje ale prowizje zostają EARNED (architekt może złożyć wniosek ponownie). Brak rollback = możliwe osierocone pliki.

---

### [S12] Brak paginacji na liście transakcji portfela i projektach

**Plik:** `src/app/dashboard/wallet/page.tsx:32-34`, `src/lib/services.ts:135-165`

```typescript
query<any>("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC", [session.user.id])
```

Brak `LIMIT`. Dla aktywnego architekta z setkami transakcji — wolna strona i potencjalnie ogromny payload. To samo dotyczy listy wszystkich projektów w `getArchitectProjects` (tryb admin).

---

### [S13] `getArchitectProjects` — problem N+1 zapytań

**Plik:** `src/lib/services.ts:160-163`

```typescript
for (const project of projects) {
    project.items = await query<any>("SELECT * FROM project_items WHERE project_id = ?", [project.id]);
    project.commissions = await query<any>("SELECT * FROM commissions WHERE project_id = ?", [project.id]);
}
```

Dla każdego projektu 2 dodatkowe zapytania do DB. Przy 50 projektach = 100 extra queries.

---

### [S14] `commissionsPENDING` w admin KPI obejmuje IN_PAYMENT

**Plik:** `src/lib/services.ts:231-234`

```typescript
WHERE status IN ('PENDING', 'IN_PAYMENT')
```

Prowizje "w trakcie realizacji" (IN_PAYMENT) są wliczane do KPI "Prowizje w toku", co może być mylące — są to faktycznie już zatwierdzone, procesowane wypłaty, nie tylko "oczekujące".

---

## 🔵 NISKIE

---

### [N1] `logActivity` używa `Math.random()` zamiast `uuidv4()`

**Plik:** `src/lib/services.ts:350`

```typescript
const id = `act_${Math.random().toString(36).substring(2, 10)}`;
```

Teoretyczna możliwość kolizji ID. Wszystkie inne miejsca w systemie używają `uuidv4()`.

---

### [N2] Brak rate limitingu na logowanie

**Plik:** `src/lib/auth.ts`

CredentialsProvider nie ma limitu prób logowania. Możliwy brute force na hasła użytkowników.

---

### [N3] Hardcoded trend "+12% vs r/r" w dashboard architekta

**Plik:** `src/app/dashboard/page.tsx:34`

```typescript
trend: '+12% vs r/r',
```

Wyświetlana statystyka nie jest wyliczana z danych — jest zawsze "+12%".

---

### [N4] `getAdminMetrics` liczy PAID prowizje w KPI "Prowizje zarobione (EARNED)"

**Plik:** `src/lib/services.ts:225-228`

```typescript
WHERE status IN ('EARNED', 'PAID')
```

Już wypłacone prowizje (PAID) są wliczane do "zarobione", co może sugerować adminowi, że te środki wciąż czekają na wypłatę.

---

### [N5] Tabela prowizji w project detail nie rozróżnia IN_PAYMENT i PAID od PENDING wizualnie

**Plik:** `src/app/dashboard/admin/projects/[id]/AdminProjectDetailClient.tsx:685-689`

Status `IN_PAYMENT` i `PAID` renderują się z tym samym żółtym kolorem co `PENDING` — trudno odróżnić bez czytania tekstu.

---

### [N6] `BEGINNER` tier_override dozwolony — ale BEGINNER jest ustawiony jako default, nie jako override

**Plik:** `src/app/dashboard/admin/architects/[id]/ArchitectProfileClient.tsx`

Dropdown tier_override pozwala wybrać 'BEGINNER' — ale BEGINNER to tier domyślny (NULL). Override na BEGINNER nie ma sensu — NULL i BEGINNER są równoważne.

---

### [N7] Przycisk "Pobierz Regulamin" jest niefunkcjonalny

**Plik:** `src/app/dashboard/wallet/page.tsx:220-222`

```tsx
<button className="...">Pobierz Regulamin</button>
```

Brak `href` / `onClick` — guzik nic nie robi. Architekt widzi coś, co sugeruje istnienie regulaminu.

---

### [N8] Brak walidacji długości pola `name` i `client_label` w projekcie

**Plik:** `src/app/actions/projects.ts:15-53`

Brak limitu długości. Bardzo długie stringi mogą powodować problemy w UI (truncation) lub zapytaniach DB.

---

### [N9] `spendCashback` — korelowane subquery dla każdej transakcji EARN

**Plik:** `src/lib/cashback.ts:13-24`

Subquery `WHERE related_item_id = wt.id` wykonuje się dla każdego wiersza EARN. Przy dużej liczbie transakcji degradacja wydajności. Lepiej: CTE lub GROUP BY.

---

### [N10] Stara ścieżka admin (`/admin/dashboard`) nadal istnieje i może być nieaktualna

**Plik:** `src/app/admin/dashboard/page.tsx`

Jak opisano w PROGRESS.md, aktywna ścieżka to `/dashboard/admin`. Stara ścieżka może mieć przestarzałe dane lub logikę. Ryzyko pomyłki przy utrzymaniu.

---

### [N11] `wallet/page.tsx` — sekcja cashback mówi "do wykorzystania na kolejne zamówienia" ale RedeemCashbackButton prowadzi do kart rabatowych

**Plik:** `src/app/dashboard/wallet/page.tsx:122-126`

Tekst informacyjny jest nieprecyzyjny — nie mówi wyraźnie, że cashback to karty podarunkowe, nie zniżka na produkt.

---

### [N12] `GroupConcat` w zapytaniu projekt→payout na profilu architekta — potencjalna różnica MySQL vs SQLite

**Plik:** `src/app/dashboard/admin/architects/[id]/page.tsx:90-96`

```sql
(SELECT GROUP_CONCAT(DISTINCT p.name) ...) as project_names
```

W SQLite `GROUP_CONCAT(DISTINCT ...)` działa, ale separator w MySQL to domyślnie przecinek, a w SQLite też. Należy jednak przetestować przy migracji na MySQL.

---

## PODSUMOWANIE

| Priorytet | Liczba | Najważniejsze |
|-----------|--------|---------------|
| 🔴 Krytyczne | 7 | Sekrety w .env, RBAC gap, publiczne faktury, hack 0.01 PLN, BEGINNER TBD |
| 🟡 Średnie | 14 | Race condition, S5 wielopozycyjna korekta, brak atomiczności, niespójny próg wypłaty |
| 🔵 Niskie | 12 | Hardcoded trend, brak paginacji, N+1, stara ścieżka admin |

### Szybkie wygrane (łatwe do wdrożenia):
1. **[K6]** Podjąć decyzję o stawce BEGINNER i zaktualizować kod
2. **[K3]** Przenieść pliki faktur poza `public/` lub dodać endpoint z auth
3. **[S9]** Ujednolicić minimalną kwotę wypłaty (100 vs 300 PLN)
4. **[S1]** Dodać whitelist dla wartości statusu w `updateProjectStatus`
5. **[S2]** Dodać walidację tier_override i commission_rate
6. **[N7]** Podpiąć lub usunąć "Pobierz Regulamin"
7. **[S10]** Dodać inline confirmation do przycisku Reject

### Wymagające refaktoru:
- **[K5]** Mechanizm "usunięcia" pozycji ZAKOŃCZONEGO projektu
- **[S5]** Przeliczanie prowizji dla całego projektu przy edycji jednej pozycji
- **[K7]** Logika powiązania kwoty wypłaty z konkretnymi komisjami
