-- G. (runda 2) Rozkład FS (2), KFS (6), PA (21) z 12 miesięcy: podtyp × status fiskalny × czy nabywca ma NIP × czy kontrahent
--    to osoba fizyczna (kh_Osoba) — z licznością, sumą brutto, liczbą dokumentów z numerem fiskalizacji
--    i liczbą dokumentów ujętych w raportach fiskalnych (rf_Pozycja; w biurze 02.11.2026 tabela była pusta). Kolumna fs_kandydaci_kontroli
--    liczy FS wg ostatecznej reguły kontroli fiskalizacji (decyzja 7a planu mostka). Tylko liczności i sumy.
SET NOCOUNT ON;
SELECT d.dok_Typ, d.dok_Podtyp, d.dok_StatusFiskal,
       CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 0 ELSE 1 END AS ma_nip,
       k.kh_Osoba,
       COUNT(*) AS ile, SUM(d.dok_WartBrutto) AS brutto,
       SUM(CASE WHEN d.dok_FiskalizacjaNumer IS NOT NULL THEN 1 ELSE 0 END) AS z_nr_fiskalizacji,
       SUM(CASE WHEN rf.rfp_DokId IS NOT NULL THEN 1 ELSE 0 END) AS w_raporcie_fiskalnym,
       SUM(CASE WHEN d.dok_StatusKSeF = 5 THEN 1 ELSE 0 END) AS ksef_status_5,
       SUM(CASE WHEN d.dok_Typ = 2 AND d.dok_Podtyp <> 1 AND ISNULL(d.dok_StatusFiskal, 0) <> 1 AND d.dok_WartBrutto > 0
                 AND (a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '') THEN 1 ELSE 0 END) AS fs_kandydaci_kontroli
FROM dbo.dok__Dokument d
LEFT JOIN dbo.adr_Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.kh__Kontrahent k ON k.kh_Id = d.dok_PlatnikId
LEFT JOIN (SELECT DISTINCT rfp_DokId FROM dbo.rf_Pozycja) rf ON rf.rfp_DokId = d.dok_Id
WHERE d.dok_Typ IN (2, 6, 21) AND d.dok_DataWyst >= DATEADD(month, -12, GETDATE())
GROUP BY d.dok_Typ, d.dok_Podtyp, d.dok_StatusFiskal,
         CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 0 ELSE 1 END, k.kh_Osoba
ORDER BY d.dok_Typ, d.dok_Podtyp, d.dok_StatusFiskal, ma_nip, k.kh_Osoba;
