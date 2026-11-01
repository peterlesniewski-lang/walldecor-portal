-- B. Podtypy FS (2) i PA (21) z ostatnich 12 miesięcy: liczność, suma brutto,
--    ile dokumentów ma dok_DoDokId wskazujący paragon (faktura wystawiona do paragonu).
SET NOCOUNT ON;
SELECT d.dok_Typ, d.dok_Podtyp, COUNT(*) AS ile, SUM(d.dok_WartBrutto) AS brutto,
       SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS do_paragonu,
       SUM(CASE WHEN d.dok_DoDokNrPelny = '+' THEN 1 ELSE 0 END) AS z_wielu_dokumentow
FROM dbo.dok__Dokument d
LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ IN (2, 21) AND d.dok_DataWyst >= DATEADD(month, -12, GETDATE())
GROUP BY d.dok_Typ, d.dok_Podtyp
ORDER BY d.dok_Typ, d.dok_Podtyp;
