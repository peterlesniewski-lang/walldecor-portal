-- A2. Rozkład wartości każdej pasującej kolumny z dok__Dokument (z zapytania A) dla FS (2), KFS (6) i PA (21)
--     z ostatnich 12 miesięcy. Pokazuje, jakie wartości przyjmuje znacznik i jak często. Do 30 wartości na kolumnę.
--     Zapytanie buduje się samo na podstawie nazw kolumn (dynamiczny SQL, wyłącznie SELECT).
SET NOCOUNT ON;
DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'SELECT TOP (30) ' + QUOTENAME(c.name, '''') + N' AS kolumna, d.dok_Typ, '
  + N'CAST(d.' + QUOTENAME(c.name) + N' AS nvarchar(200)) AS wartosc, COUNT(*) AS ile '
  + N'FROM dbo.dok__Dokument d '
  + N'WHERE d.dok_Typ IN (2, 6, 21) AND d.dok_DataWyst >= DATEADD(month, -12, GETDATE()) '
  + N'GROUP BY d.dok_Typ, CAST(d.' + QUOTENAME(c.name) + N' AS nvarchar(200)) '
  + N'ORDER BY d.dok_Typ, ile DESC;' + CHAR(10)
FROM sys.columns c
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.dok__Dokument')
  AND (c.name LIKE '%Fisk%' OR c.name LIKE '%Parag%' OR c.name LIKE '%Detal%' OR c.name LIKE '%KSeF%' OR c.name LIKE '%Podtyp%')
  AND ty.name NOT IN ('text', 'ntext', 'image', 'xml', 'varbinary', 'binary', 'geography', 'geometry', 'hierarchyid');
IF @sql = N''
    PRINT 'A2: brak pasujących kolumn w dok__Dokument';
ELSE
    EXEC sys.sp_executesql @sql;
