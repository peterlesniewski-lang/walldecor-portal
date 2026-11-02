-- J. (runda 2) Magazyny i daty dokumentu.
--    J1: lista magazynów (sl_Magazyn) z liczbą i sumą brutto FS/KFS/PA/ZW z 12 miesięcy per magazyn
--        (sprawdzamy, czy istnieje magazyn INT i co się w nim dzieje — D pokazało RW 1/INT/01/2026).
--    J2: wszystkie kolumny dat w nagłówku dokumentu (dok_Data%) — do wyboru daty przychodu.
--    Jeśli J1 zgłosi brak kolumny dok_MagId albo tabeli sl_Magazyn, treść błędu jest wynikiem.
SET NOCOUNT ON;
-- J1
SELECT m.mag_Id, m.mag_Symbol, m.mag_Nazwa, d.dok_Typ, COUNT(d.dok_Id) AS ile, SUM(d.dok_WartBrutto) AS brutto
FROM dbo.sl_Magazyn m
LEFT JOIN dbo.dok__Dokument d ON d.dok_MagId = m.mag_Id
     AND d.dok_Typ IN (2, 6, 21, 14) AND d.dok_DataWyst >= DATEADD(month, -12, GETDATE())
GROUP BY m.mag_Id, m.mag_Symbol, m.mag_Nazwa, d.dok_Typ
ORDER BY m.mag_Id, d.dok_Typ;

-- J2
SELECT COLUMN_NAME AS kolumna, DATA_TYPE AS typ
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'dok__Dokument' AND COLUMN_NAME LIKE 'dok_Data%'
ORDER BY COLUMN_NAME;
