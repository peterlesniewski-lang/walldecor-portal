-- K. (runda 2) Zwroty detaliczne ZW (typ 14) i dokument RS (typ 4): znak kwot, co wskazują (dok_DoDokId), status fiskalny.
--    Potrzebne, żeby ustalić, czy ZW obniża sprzedaż paragonową w mostku. Numery i kwoty, bez nazw.
SET NOCOUNT ON;
-- K1
SELECT d.dok_Typ, d.dok_Podtyp, COUNT(*) AS ile, SUM(d.dok_WartBrutto) AS brutto_suma,
       MIN(d.dok_WartBrutto) AS brutto_min, MAX(d.dok_WartBrutto) AS brutto_max,
       SUM(CASE WHEN c.dok_Typ = 21 THEN 1 ELSE 0 END) AS wskazuje_pa,
       SUM(CASE WHEN c.dok_Typ = 2 THEN 1 ELSE 0 END) AS wskazuje_fs,
       SUM(CASE WHEN d.dok_StatusFiskal = 1 THEN 1 ELSE 0 END) AS zafiskalizowane
FROM dbo.dok__Dokument d
LEFT JOIN dbo.dok__Dokument c ON c.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ IN (14, 4) AND d.dok_DataWyst >= DATEADD(month, -24, GETDATE())
GROUP BY d.dok_Typ, d.dok_Podtyp;

-- K2
SELECT TOP (10) d.dok_Id, d.dok_Typ, d.dok_NrPelny AS numer, CONVERT(char(10), d.dok_DataWyst, 23) AS data_,
       d.dok_WartBrutto AS brutto, d.dok_StatusFiskal, d.dok_DoDokNrPelny AS do_dokumentu, c.dok_Typ AS cel_typ
FROM dbo.dok__Dokument d
LEFT JOIN dbo.dok__Dokument c ON c.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ IN (14, 4)
ORDER BY d.dok_DataWyst DESC;
