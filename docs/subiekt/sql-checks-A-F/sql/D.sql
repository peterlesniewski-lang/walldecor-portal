-- D. Wszystkie typy dokumentów z ostatnich 12 miesięcy: liczność i przykładowy numer
--    (szukamy zwrotów do paragonu i innych typów detalicznych).
SET NOCOUNT ON;
SELECT dok_Typ, dok_Podtyp, COUNT(*) AS ile, MIN(dok_NrPelny) AS przyklad1, MAX(dok_NrPelny) AS przyklad2
FROM dbo.dok__Dokument
WHERE dok_DataWyst >= DATEADD(month, -12, GETDATE())
GROUP BY dok_Typ, dok_Podtyp
ORDER BY dok_Typ, dok_Podtyp;
