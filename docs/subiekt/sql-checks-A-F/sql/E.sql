-- E. FS dla nabywcy bez NIP (kandydaci do kontroli fiskalizacji) z ostatnich 3 miesięcy:
--    E1 liczności (ile ma paragon w łańcuchu), E2 do 10 przykładów bez paragonu (numery i kwoty, bez nazw).
SET NOCOUNT ON;
-- E1
SELECT COUNT(*) AS fs_bez_nip,
       SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS z_paragonem,
       SUM(CASE WHEN p.dok_Typ = 21 THEN 0 ELSE 1 END) AS bez_paragonu
FROM dbo.dok__Dokument d
JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ = 2 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
  AND (a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '');

-- E2
SELECT TOP (10) d.dok_Id, d.dok_NrPelny AS fs, d.dok_Podtyp, CONVERT(char(10), d.dok_DataWyst, 23) AS data_fs,
       d.dok_WartBrutto AS brutto, d.dok_DoDokNrPelny AS z_dokumentu
FROM dbo.dok__Dokument d
JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ = 2 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
  AND (a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '')
  AND (p.dok_Id IS NULL OR p.dok_Typ <> 21)
ORDER BY d.dok_DataWyst DESC, d.dok_Id DESC;
