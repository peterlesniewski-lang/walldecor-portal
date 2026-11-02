-- H. (runda 2) Podtypy FS 1 i 3 oraz powiązania paragon ↔ faktura.
--    H1: do 10 przykładów FS podtypu 1 i 3 (numer, data, kwota, status fiskalny, dokument źródłowy, czy ma NIP).
--    H2: paragony, które same wskazują inny dokument (dok_DoDokId) — typ i numer celu (czy PA → FS?).
--    H3: dokumenty, na które wskazuje jakikolwiek paragon.
--    Numery i kwoty, bez nazw.
SET NOCOUNT ON;
-- H1
SELECT TOP (20) d.dok_Id, d.dok_Podtyp, d.dok_NrPelny AS fs, CONVERT(char(10), d.dok_DataWyst, 23) AS data_fs,
       d.dok_WartBrutto AS brutto, d.dok_StatusFiskal, d.dok_FiskalizacjaNumer, d.dok_DoDokNrPelny AS z_dokumentu,
       CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 0 ELSE 1 END AS ma_nip
FROM dbo.dok__Dokument d
LEFT JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
WHERE d.dok_Typ = 2 AND d.dok_Podtyp IN (1, 3)
ORDER BY d.dok_Podtyp, d.dok_DataWyst DESC;

-- H2
SELECT TOP (10) p.dok_Id, p.dok_NrPelny AS pa, CONVERT(char(10), p.dok_DataWyst, 23) AS data_pa, p.dok_WartBrutto AS pa_brutto,
       p.dok_DoDokId, p.dok_DoDokNrPelny, c.dok_Typ AS cel_typ, c.dok_Podtyp AS cel_podtyp
FROM dbo.dok__Dokument p
LEFT JOIN dbo.dok__Dokument c ON c.dok_Id = p.dok_DoDokId
WHERE p.dok_Typ = 21 AND p.dok_DoDokId IS NOT NULL
ORDER BY p.dok_DataWyst DESC;

-- H3
SELECT c.dok_Typ AS cel_typ, c.dok_Podtyp AS cel_podtyp, COUNT(*) AS ile_paragonow_wskazuje
FROM dbo.dok__Dokument p
JOIN dbo.dok__Dokument c ON c.dok_Id = p.dok_DoDokId
WHERE p.dok_Typ = 21
GROUP BY c.dok_Typ, c.dok_Podtyp;
