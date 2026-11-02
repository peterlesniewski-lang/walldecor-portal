-- C. 10 najnowszych FS wystawionych do paragonu: numer FS, podtyp, data, kwota, numer i kwota paragonu.
--    Numery i kwoty dokumentów, bez nazw kontrahentów.
SET NOCOUNT ON;
SELECT TOP (10) d.dok_Id, d.dok_NrPelny AS fs, d.dok_Podtyp, CONVERT(char(10), d.dok_DataWyst, 23) AS data_fs,
       d.dok_WartBrutto AS fs_brutto, p.dok_NrPelny AS pa, p.dok_Podtyp AS pa_podtyp, p.dok_WartBrutto AS pa_brutto
FROM dbo.dok__Dokument d
JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ = 2 AND p.dok_Typ = 21
ORDER BY d.dok_DataWyst DESC, d.dok_Id DESC;
