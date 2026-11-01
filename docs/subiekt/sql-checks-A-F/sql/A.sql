-- A. Kolumny w całej bazie, które mogą oznaczać fiskalizację, fakturę detaliczną, paragon lub status KSeF
--    (plus kolumny "Podtyp" w nagłówku dokumentu). Tylko metadane, bez danych.
SET NOCOUNT ON;
SELECT c.TABLE_NAME AS tabela, c.COLUMN_NAME AS kolumna, c.DATA_TYPE AS typ
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = 'dbo'
  AND (c.COLUMN_NAME LIKE '%Fisk%' OR c.COLUMN_NAME LIKE '%Parag%' OR c.COLUMN_NAME LIKE '%Detal%'
       OR c.COLUMN_NAME LIKE '%KSeF%' OR c.TABLE_NAME LIKE '%KSeF%'
       OR (c.TABLE_NAME = 'dok__Dokument' AND c.COLUMN_NAME LIKE '%Podtyp%'))
ORDER BY c.TABLE_NAME, c.COLUMN_NAME;
