-- A3. Tabele poza dok__Dokument, które mają kolumny KSeF / fiskalizacji / paragonu albo KSeF w nazwie:
--     pełna lista ich kolumn (żeby znaleźć powiązanie z dok_Id) oraz liczba wierszy. Tylko metadane i liczności.
SET NOCOUNT ON;
SELECT t.name AS tabela, c.name AS kolumna, ty.name AS typ
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.schema_id = SCHEMA_ID('dbo') AND t.name <> 'dok__Dokument'
  AND (t.name LIKE '%KSeF%' OR t.object_id IN (
        SELECT c2.object_id FROM sys.columns c2
        WHERE c2.name LIKE '%KSeF%' OR c2.name LIKE '%Fisk%' OR c2.name LIKE '%Parag%'))
ORDER BY t.name, c.column_id;

DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'SELECT ' + QUOTENAME(t.name, '''') + N' AS tabela, COUNT(*) AS wierszy FROM dbo.' + QUOTENAME(t.name) + N';' + CHAR(10)
FROM sys.tables t
WHERE t.schema_id = SCHEMA_ID('dbo') AND t.name <> 'dok__Dokument'
  AND (t.name LIKE '%KSeF%' OR t.object_id IN (
        SELECT c2.object_id FROM sys.columns c2
        WHERE c2.name LIKE '%KSeF%' OR c2.name LIKE '%Fisk%' OR c2.name LIKE '%Parag%'));
IF @sql = N''
    PRINT 'A3: brak innych tabel z kolumnami KSeF / fiskalizacji';
ELSE
    EXEC sys.sp_executesql @sql;
