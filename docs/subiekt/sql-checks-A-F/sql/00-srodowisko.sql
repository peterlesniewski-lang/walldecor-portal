-- 00. Środowisko: wersja serwera, baza, login, czas serwera, liczba dokumentów (bez danych osobowych)
SET NOCOUNT ON;
SELECT @@VERSION AS wersja;
SELECT DB_NAME() AS baza, @@SERVERNAME AS serwer, SUSER_SNAME() AS login_sql, GETDATE() AS czas_serwera;
SELECT COUNT(*) AS dokumentow_razem FROM dbo.dok__Dokument;
