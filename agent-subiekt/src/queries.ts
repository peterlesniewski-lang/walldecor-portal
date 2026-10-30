// Całe SQL agenta i lista tabel/kolumn sprawdzanych przez sondę (--probe). Schemat bazy GT zweryfikowany
// w biurze 30.10.2026 (PLAN-SUBIEKT-2026-10-29.md, Loop 5); adrh__Historia i adr__Ewid potwierdza sonda.
// Agent wyłącznie czyta (login portal_reader: db_datareader + DENY INSERT/UPDATE/DELETE/EXECUTE).

/** Każda kolumna użyta w zapytaniach poniżej. Sonda kończy się kodem ≠ 0, gdy którejś brakuje. */
export const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
    dok__Dokument: [
        'dok_Id', 'dok_Typ', 'dok_Podtyp', 'dok_Status', 'dok_NrPelny', 'dok_DataWyst', 'dok_DoDokId', 'dok_DoDokNrPelny',
        'dok_PlatnikId', 'dok_PlatnikAdreshId', 'dok_KatId', 'dok_Uwagi', 'dok_WartNetto', 'dok_WartBrutto',
    ],
    dok_Pozycja: [
        'ob_Id', 'ob_DokHanId', 'ob_DokHanLp', 'ob_DoId', 'ob_Znak', 'ob_TowId', 'ob_TowRodzaj', 'ob_Opis',
        'ob_Ilosc', 'ob_Jm', 'ob_CenaNetto', 'ob_WartNetto',
    ],
    tw__Towar: ['tw_Id', 'tw_Nazwa'],
    kh__Kontrahent: ['kh_Id', 'kh_Symbol'],
    adrh__Historia: ['adrh_Id', 'adrh_Nazwa', 'adrh_NazwaPelna', 'adrh_NIP'],
    adr__Ewid: ['adr_Id', 'adr_IdObiektu', 'adr_TypAdresu', 'adr_Nazwa', 'adr_NazwaPelna', 'adr_NIP'],
    nz__Finanse: ['nzf_Id', 'nzf_IdDokumentAuto', 'nzf_Typ', 'nzf_Wartosc', 'nzf_WartoscPierwotna'],
    sl_Kategoria: ['kat_Id', 'kat_Nazwa'],
};

/** dok_Typ: ZK 16, FS 2, KFS 6, WZ 11 (zob. chain.ts GT_DOC_TYPE). */
const CHAIN_TYPES = '16, 2, 6, 11';
/**
 * Parametr @since: 'YYYY-MM-DD' (VarChar) → datetime stylem 126 (ISO 8601 z 'T'), niezależnie od DATEFORMAT
 * i języka serwera; bez stref czasowych. (Styl 23 przy wejściu dawał błąd konwersji — test na SQL Edge 15.0.)
 */
const SINCE = "CONVERT(datetime, @since + 'T00:00:00', 126)";

/** Kolumny nagłówka (chain.ts HeaderRow); dok_DataWyst jako 'YYYY-MM-DD' (styl 23), bez konwersji stref. */
const HEADER_COLUMNS = `d.dok_Id, d.dok_Typ, d.dok_Podtyp, d.dok_Status, d.dok_NrPelny,
       CONVERT(char(10), d.dok_DataWyst, 23) AS dok_DataWyst,
       d.dok_DoDokId, d.dok_DoDokNrPelny, d.dok_PlatnikId, d.dok_KatId, d.dok_Uwagi,
       d.dok_WartNetto, d.dok_WartBrutto`;

/**
 * Nagłówki kandydatów do łańcuchów z okresu: korzenie (ZK/FS) i możliwe dokumenty pochodne (WZ/FS/KFS).
 * Wybór zbioru robi chain.ts; dok_DataWyst jako 'YYYY-MM-DD' (styl 23), bez konwersji stref.
 */
export const SQL_CHAIN_HEADERS = `
SELECT ${HEADER_COLUMNS}
FROM dbo.dok__Dokument d
WHERE d.dok_Typ IN (${CHAIN_TYPES}) AND d.dok_DataWyst >= ${SINCE}`;

/** Nagłówki przodków spoza okresu (chain.ts fetchAncestors) — bez limitu daty, tylko typy łańcucha. */
export const sqlHeadersByIds = (inList: string) => `
SELECT ${HEADER_COLUMNS}
FROM dbo.dok__Dokument d
WHERE d.dok_Typ IN (${CHAIN_TYPES}) AND d.dok_Id IN (${inList})`;

/**
 * ZK architektów płatników FS '+' (chain.ts fetchPayerHistory), bez limitu daty. LIKE to tylko wstępny filtr —
 * dokładny znacznik sprawdza chain.ts. Parametr @categoryId = ARCHITECT_CATEGORY_ID.
 */
export const sqlArchitectZkOfPayers = (inList: string) => `
SELECT ${HEADER_COLUMNS}
FROM dbo.dok__Dokument d
WHERE d.dok_Typ = 16 AND d.dok_PlatnikId IN (${inList})
  AND (d.dok_KatId = @categoryId OR d.dok_Uwagi LIKE '%#A%')`;

/** FS i WZ płatników mających ZK architekta (czy ZK ma już fakturę), bez limitu daty. */
export const sqlInvoicesOfPayers = (inList: string) => `
SELECT ${HEADER_COLUMNS}
FROM dbo.dok__Dokument d
WHERE d.dok_Typ IN (2, 11) AND d.dok_PlatnikId IN (${inList})`;

/** Kontrahent dokumentu: historia adresu z dokumentu, zapasowo adres główny z ewidencji, symbol z kartoteki. */
export const sqlContractors = (inList: string) => `
SELECT d.dok_Id, ah.adrh_Nazwa, ah.adrh_NazwaPelna, ah.adrh_NIP,
       ae.adr_Nazwa, ae.adr_NazwaPelna, ae.adr_NIP, kh.kh_Symbol
FROM dbo.dok__Dokument d
LEFT JOIN dbo.adrh__Historia ah ON ah.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.kh__Kontrahent kh ON kh.kh_Id = d.dok_PlatnikId
OUTER APPLY (
    SELECT TOP 1 a.adr_Nazwa, a.adr_NazwaPelna, a.adr_NIP
    FROM dbo.adr__Ewid a
    WHERE a.adr_IdObiektu = d.dok_PlatnikId AND a.adr_TypAdresu = 1
    ORDER BY a.adr_Id
) ae
WHERE d.dok_Id IN (${inList})`;

/** Pozycje dokumentów z nazwą karty towaru (gdy jest). */
export const sqlPositions = (inList: string) => `
SELECT p.ob_Id, p.ob_DokHanId, p.ob_DokHanLp, p.ob_DoId, p.ob_Znak, p.ob_TowId, p.ob_TowRodzaj, p.ob_Opis,
       t.tw_Nazwa, p.ob_Ilosc, p.ob_Jm, p.ob_CenaNetto, p.ob_WartNetto
FROM dbo.dok_Pozycja p
LEFT JOIN dbo.tw__Towar t ON t.tw_Id = p.ob_TowId
WHERE p.ob_DokHanId IN (${inList})`;

/** Rozrachunki dokumentów (należności nzf_Typ 39 i inne) — paid.ts liczy is_paid. */
export const sqlFinance = (inList: string) => `
SELECT f.nzf_Id, f.nzf_IdDokumentAuto, f.nzf_Typ, f.nzf_Wartosc, f.nzf_WartoscPierwotna
FROM dbo.nz__Finanse f
WHERE f.nzf_IdDokumentAuto IN (${inList})`;

// --- Sonda (--probe) ---

/** Kolumny wymaganych tabel; nazwy tabel z listy wstawiane jako parametry @t0…. */
export const sqlColumns = (inList: string) => `
SELECT c.TABLE_NAME, c.COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = 'dbo' AND c.TABLE_NAME IN (${inList})`;

export const SQL_TABLES = `SELECT t.TABLE_NAME FROM INFORMATION_SCHEMA.TABLES t WHERE t.TABLE_SCHEMA = 'dbo'`;

export const SQL_TYPE_COUNTS = `
SELECT d.dok_Typ, d.dok_Podtyp, COUNT(*) AS ile
FROM dbo.dok__Dokument d
WHERE d.dok_DataWyst >= ${SINCE}
GROUP BY d.dok_Typ, d.dok_Podtyp
ORDER BY d.dok_Typ, d.dok_Podtyp`;

export const SQL_CATEGORY = `SELECT k.kat_Id, k.kat_Nazwa FROM dbo.sl_Kategoria k WHERE k.kat_Id = @categoryId`;

export const SQL_ADDRESS_HISTORY_SAMPLE = `SELECT TOP 1 * FROM dbo.adrh__Historia`;

/** Kolacja bazy — czy LIKE '%#A%' w sqlArchitectZkOfPayers jest bez rozróżniania wielkości liter. */
export const SQL_COLLATION = `SELECT CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS nvarchar(128)) AS kolacja`;
