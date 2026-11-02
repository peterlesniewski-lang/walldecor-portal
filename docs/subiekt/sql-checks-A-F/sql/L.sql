-- L. (runda 2, reguła ostateczna z 2026-11-02 — decyzja 7a planu mostka) Lista kontroli fiskalizacji: FS z 3 miesięcy
--    dla nabywcy bez NIP (adr_Historia.adrh_NIP puste), podtyp inny niż 1 (faktura do paragonu — paragon był fiskalny),
--    dok_StatusFiskal <> 1, kwota brutto > 0. Status KSeF tylko informacyjnie (firma wysyła do KSeF także faktury bez NIP).
--    L1: liczność z podziałem na podtyp, status fiskalny i status KSeF. L2: do 20 przykładów (numery i kwoty, bez nazw).
SET NOCOUNT ON;
-- L1
SELECT d.dok_Podtyp, d.dok_StatusFiskal, d.dok_StatusKSeF, COUNT(*) AS ile, SUM(d.dok_WartBrutto) AS brutto
FROM dbo.dok__Dokument d
LEFT JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
WHERE d.dok_Typ = 2 AND d.dok_Podtyp <> 1 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
  AND (a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '')
  AND ISNULL(d.dok_StatusFiskal, 0) <> 1
  AND d.dok_WartBrutto > 0
GROUP BY d.dok_Podtyp, d.dok_StatusFiskal, d.dok_StatusKSeF
ORDER BY ile DESC;

-- L2
SELECT TOP (20) d.dok_Id, d.dok_NrPelny AS fs, d.dok_Podtyp, CONVERT(char(10), d.dok_DataWyst, 23) AS data_fs,
       d.dok_WartBrutto AS brutto, d.dok_StatusFiskal, d.dok_StatusKSeF, k.kh_Osoba, d.dok_DoDokNrPelny AS z_dokumentu
FROM dbo.dok__Dokument d
LEFT JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.kh__Kontrahent k ON k.kh_Id = d.dok_PlatnikId
WHERE d.dok_Typ = 2 AND d.dok_Podtyp <> 1 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
  AND (a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '')
  AND ISNULL(d.dok_StatusFiskal, 0) <> 1
  AND d.dok_WartBrutto > 0
ORDER BY d.dok_DataWyst DESC, d.dok_Id DESC;
