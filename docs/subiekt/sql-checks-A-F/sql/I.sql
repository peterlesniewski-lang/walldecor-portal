-- I. (runda 2) KSeF: co znaczy dok_StatusKSeF i gdzie jest numer KSeF.
--    I1: rozkład FS/KFS z 12 miesięcy: status KSeF × czy nadany numer (niepusty tekst w ksef_NumerKSeF po dok_NumerKSeFId) × czy nabywca ma NIP × kh_Osoba.
--    I2: 5 przykładów numerów KSeF z datą nadania (numer KSeF zawiera NIP sprzedawcy, nie nabywcy).
--    I3: status przetworzenia w ksef_Faktury dla dokumentów handlowych (ksef_FakturyHandel) — rozkład.
SET NOCOUNT ON;
-- I1
SELECT d.dok_Typ, d.dok_StatusKSeF,
       CASE WHEN n.ksefnr_NumerKSeF IS NULL OR LTRIM(RTRIM(n.ksefnr_NumerKSeF)) = '' THEN 0 ELSE 1 END AS ma_numer_ksef,
       CASE WHEN d.dok_SrodowiskoKSeF IS NULL THEN -1 ELSE d.dok_SrodowiskoKSeF END AS srodowisko,
       CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 0 ELSE 1 END AS ma_nip,
       k.kh_Osoba,
       COUNT(*) AS ile, SUM(d.dok_WartBrutto) AS brutto,
       MIN(CONVERT(char(10), d.dok_DataWyst, 23)) AS od, MAX(CONVERT(char(10), d.dok_DataWyst, 23)) AS do_
FROM dbo.dok__Dokument d
LEFT JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.kh__Kontrahent k ON k.kh_Id = d.dok_PlatnikId
LEFT JOIN dbo.ksef_NumerKSeF n ON n.ksefnr_Id = d.dok_NumerKSeFId
WHERE d.dok_Typ IN (2, 6) AND d.dok_DataWyst >= DATEADD(month, -12, GETDATE())
GROUP BY d.dok_Typ, d.dok_StatusKSeF, CASE WHEN n.ksefnr_NumerKSeF IS NULL OR LTRIM(RTRIM(n.ksefnr_NumerKSeF)) = '' THEN 0 ELSE 1 END,
         CASE WHEN d.dok_SrodowiskoKSeF IS NULL THEN -1 ELSE d.dok_SrodowiskoKSeF END,
         CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 0 ELSE 1 END, k.kh_Osoba
ORDER BY d.dok_Typ, d.dok_StatusKSeF, ma_numer_ksef, ma_nip, k.kh_Osoba;

-- I2
SELECT TOP (5) d.dok_NrPelny AS fs, d.dok_StatusKSeF, n.ksefnr_NumerKSeF, n.ksefnr_DataNadania
FROM dbo.dok__Dokument d
JOIN dbo.ksef_NumerKSeF n ON n.ksefnr_Id = d.dok_NumerKSeFId
WHERE d.dok_Typ = 2
ORDER BY n.ksefnr_DataNadania DESC;

-- I3
SELECT f.ksef_Rodzaj, f.ksef_StatusPrzetworzenia, f.ksef_StatusBledu, COUNT(*) AS ile,
       SUM(CASE WHEN f.ksef_NumerKSeF IS NULL THEN 0 ELSE 1 END) AS z_numerem
FROM dbo.ksef_FakturyHandel h
JOIN dbo.ksef_Faktury f ON f.ksef_Id = h.ksefh_IdFaktury
JOIN dbo.dok__Dokument d ON d.dok_Id = h.ksefh_IdDokumentu
WHERE d.dok_Typ IN (2, 6)
GROUP BY f.ksef_Rodzaj, f.ksef_StatusPrzetworzenia, f.ksef_StatusBledu
ORDER BY ile DESC;
